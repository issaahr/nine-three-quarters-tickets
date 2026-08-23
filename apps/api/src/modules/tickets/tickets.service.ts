import { Injectable } from '@nestjs/common';
import { EntityManager, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';

import { CheckInResult } from './checkInResult.enum';
import { Ticket } from './ticket.entity';
import { TicketCredentialService } from './ticketCredential.service';
import { TicketCredentialGenerationError } from './errors/ticketCredentialGeneration.error';
import { TicketNotFoundError } from './errors/ticketNotFound.error';
import { TicketRepository } from './repositories/ticket.repository';
import { TicketDetails, TicketPurchase } from './tickets.interfaces';
import { TicketStatus } from './ticketStatus.enum';
import { Payment } from '../payments/payment.entity';
import { PaymentStatus } from '../payments/paymentStatus.enum';

const maximumCredentialGenerationAttempts = 20;

/** Emite Tickets individuais dentro da transaction que confirma a Reservation. */
@Injectable()
export class TicketsService {
  public constructor(
    private readonly ticketCredentialService: TicketCredentialService,
    private readonly ticketRepository: TicketRepository,
    @InjectRepository(Payment)
    private readonly paymentsRepository: Repository<Payment>,
  ) {}

  /**
   * Emite exatamente um Ticket por ReservationItem, preservando a proteção de unicidade do banco.
   *
   * `ON CONFLICT DO NOTHING` permite gerar outra credencial após uma colisão sem invalidar a
   * transaction PostgreSQL em curso.
   * @param manager - Manager vinculado à transação que confirma a Reservation.
   * @param reservationItemIds - ReservationItems que devem receber um Ticket.
   * @param issuedAt - Instante autoritativo do PostgreSQL usado como issuedAt.
   * @returns Conclui quando todos os Tickets foram emitidos ou já existiam.
   */
  public async issueForReservationItems(
    manager: EntityManager,
    reservationItemIds: string[],
    issuedAt: Date,
  ): Promise<void> {
    for (const reservationItemId of reservationItemIds) {
      await this.issueForReservationItem(manager, reservationItemId, issuedAt);
    }
  }

  /**
   * Agrupa os Tickets confirmados do CUSTOMER por Reservation, mantendo cada unidade independente.
   *
   * @param customerId - Identidade do CUSTOMER autenticado.
   * @param reservationId - Compra opcional selecionada pelo CUSTOMER.
   * @returns Compras confirmadas com seus Tickets individuais.
   */
  public async listOwned(customerId: string, reservationId?: string): Promise<TicketPurchase[]> {
    const tickets = await this.ticketRepository.findConfirmedByCustomer(customerId, reservationId);
    const purchases = new Map<string, TicketPurchase>();

    for (const ticket of tickets) {
      const details = this.toDetails(ticket);
      const existingPurchase = purchases.get(ticket.reservationItem.reservationId);

      if (existingPurchase) {
        existingPurchase.tickets.push(details);
        continue;
      }

      purchases.set(ticket.reservationItem.reservationId, {
        reservationId: ticket.reservationItem.reservationId,
        confirmedAt: ticket.reservationItem.reservation.confirmedAt!,
        event: details.event,
        tickets: [details],
        canCancel: false,
        eligibleUntil: null,
        paymentMethod: null,
      });
    }

    // A elegibilidade termina no menor instante entre sete dias da aprovação e o início do evento.
    const now = new Date();
    return Promise.all(
      [...purchases.values()].map(async (purchase) => {
        const payment = await this.paymentsRepository.findOneBy({
          reservationId: purchase.reservationId,
          status: PaymentStatus.Approved,
        });
        const eligibleUntil = payment?.approvedAt
          ? new Date(
              Math.min(
                payment.approvedAt.getTime() + 7 * 24 * 60 * 60 * 1000,
                purchase.event.startsAt.getTime(),
              ),
            )
          : null;
        return {
          ...purchase,
          paymentMethod: payment?.method ?? null,
          eligibleUntil,
          canCancel:
            Boolean(eligibleUntil) &&
            eligibleUntil!.getTime() > now.getTime() &&
            purchase.tickets.every((ticket) => ticket.status === TicketStatus.Valid),
        };
      }),
    );
  }

  /**
   * Resolve uma credencial compartilhável e sempre consulta o estado corrente do Ticket no banco.
   *
   * @param credential - Valor apresentado pelo QR ou pelo link compartilhável.
   * @returns Ticket individual correspondente à credencial válida.
   */
  public async findShared(credential: string): Promise<TicketDetails> {
    const publicId = this.ticketCredentialService.getVerifiedPublicId(credential);

    if (!publicId) {
      throw new TicketNotFoundError();
    }

    const ticket = await this.ticketRepository.findPresentationByPublicId(publicId);

    if (!ticket) {
      throw new TicketNotFoundError();
    }

    return this.toDetails(ticket);
  }

  /**
   * Valida uma credencial QR e registra a entrada somente quando o Ticket ainda for elegível.
   *
   * @param activeEventId - Event selecionado como contexto ativo pela portaria.
   * @param gateUserId - Operador GATE autenticado que realiza a validação.
   * @param credential - Credencial QR apresentada pelo portador do Ticket.
   * @returns Resultado semântico da tentativa de check-in.
   */
  public async checkInCredential(
    activeEventId: string,
    gateUserId: string,
    credential: string,
  ): Promise<CheckInResult> {
    const publicId = this.ticketCredentialService.getVerifiedPublicId(credential);

    if (!publicId) {
      return CheckInResult.Invalid;
    }

    const ticket = await this.ticketRepository.findForCheckInByPublicId(publicId);
    return this.checkInResolvedTicket(activeEventId, gateUserId, ticket);
  }

  /**
   * Valida um código manual normalizado no mesmo fluxo atômico da credencial QR.
   *
   * @param activeEventId - Event selecionado como contexto ativo pela portaria.
   * @param gateUserId - Operador GATE autenticado que realiza a validação.
   * @param manualCode - Código manual informado pelo operador.
   * @returns Resultado semântico da tentativa de check-in.
   */
  public async checkInManualCode(
    activeEventId: string,
    gateUserId: string,
    manualCode: string,
  ): Promise<CheckInResult> {
    const normalizedManualCode = this.ticketCredentialService.normalizeManualCode(manualCode);

    if (!normalizedManualCode) {
      return CheckInResult.Invalid;
    }

    const ticket = await this.ticketRepository.findForCheckInByManualCode(normalizedManualCode);
    return this.checkInResolvedTicket(activeEventId, gateUserId, ticket);
  }

  private async issueForReservationItem(
    manager: EntityManager,
    reservationItemId: string,
    issuedAt: Date,
  ): Promise<void> {
    const existingTicket = await this.ticketRepository.findByReservationItemId(
      manager,
      reservationItemId,
    );

    if (existingTicket) {
      return;
    }

    for (let attempt = 0; attempt < maximumCredentialGenerationAttempts; attempt += 1) {
      const inserted = await this.ticketRepository.insertIgnoringCredentialConflict(
        manager,
        reservationItemId,
        this.ticketCredentialService.createPublicId(),
        this.ticketCredentialService.createManualCode(),
        issuedAt,
      );

      if (inserted) {
        return;
      }
    }

    throw new TicketCredentialGenerationError();
  }

  /**
   * Aplica a precedência dos resultados e usa escrita condicional como autoridade do uso único.
   */
  private async checkInResolvedTicket(
    activeEventId: string,
    gateUserId: string,
    ticket: Ticket | null,
  ): Promise<CheckInResult> {
    if (!ticket) {
      return CheckInResult.Invalid;
    }

    const initialResult = this.getCheckInResult(activeEventId, ticket);

    if (initialResult !== CheckInResult.Valid) {
      return initialResult;
    }

    if (await this.ticketRepository.markCheckedIn(ticket.id, gateUserId)) {
      return CheckInResult.Valid;
    }

    const currentTicket = await this.ticketRepository.findForCheckInById(ticket.id);
    return this.getCheckInResult(activeEventId, currentTicket);
  }

  private getCheckInResult(activeEventId: string, ticket: Ticket | null): CheckInResult {
    if (!ticket) {
      return CheckInResult.Invalid;
    }

    if (ticket.reservationItem.reservation.eventId !== activeEventId) {
      return CheckInResult.EventMismatch;
    }

    if (ticket.cancelledAt) {
      return CheckInResult.Cancelled;
    }

    return ticket.checkedInAt ? CheckInResult.AlreadyUsed : CheckInResult.Valid;
  }

  private toDetails(ticket: Ticket): TicketDetails {
    const reservationItem = ticket.reservationItem;
    const reservation = reservationItem.reservation;
    const event = reservation.event;
    const venue = event.venue;

    return {
      publicId: ticket.publicId,
      credential: this.ticketCredentialService.createCredential(ticket.publicId),
      manualCode: ticket.manualCode,
      status: this.getStatus(ticket),
      issuedAt: ticket.issuedAt,
      seatLabel: reservationItem.eventSeat?.venueSeat.label ?? null,
      event: {
        id: event.id,
        title: event.title,
        category: event.category,
        admissionMode: event.admissionMode,
        startsAt: event.startsAt,
        venueName: venue.name,
        venueCity: venue.city,
        venueTimeZone: venue.timeZone,
      },
    };
  }

  private getStatus(ticket: Ticket): TicketStatus {
    if (ticket.cancelledAt) {
      return TicketStatus.Cancelled;
    }

    return ticket.checkedInAt ? TicketStatus.Used : TicketStatus.Valid;
  }
}
