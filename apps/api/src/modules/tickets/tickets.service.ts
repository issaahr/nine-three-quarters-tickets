import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';

import { Ticket } from './ticket.entity';
import { TicketCredentialService } from './ticketCredential.service';
import { TicketCredentialGenerationError } from './errors/ticketCredentialGeneration.error';
import { TicketNotFoundError } from './errors/ticketNotFound.error';
import { TicketRepository } from './repositories/ticket.repository';
import { TicketDetails, TicketPurchase } from './tickets.interfaces';
import { TicketStatus } from './ticketStatus.enum';

const maximumCredentialGenerationAttempts = 20;

/** Emite Tickets individuais dentro da transaction que confirma a Reservation. */
@Injectable()
export class TicketsService {
  public constructor(
    private readonly ticketCredentialService: TicketCredentialService,
    private readonly ticketRepository: TicketRepository,
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
      });
    }

    return [...purchases.values()];
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
