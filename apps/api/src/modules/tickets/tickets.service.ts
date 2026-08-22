import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';

import { TicketCredentialService } from './ticketCredential.service';
import { TicketCredentialGenerationError } from './errors/ticketCredentialGeneration.error';
import { TicketRepository } from './repositories/ticket.repository';

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
}
