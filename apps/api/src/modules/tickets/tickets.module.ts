import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Ticket } from './ticket.entity';
import { TicketCredentialService } from './ticketCredential.service';
import { TicketRepository } from './repositories/ticket.repository';
import { TicketsService } from './tickets.service';

@Module({
  imports: [TypeOrmModule.forFeature([Ticket])],
  providers: [TicketCredentialService, TicketRepository, TicketsService],
  exports: [TicketCredentialService, TicketsService],
})
export class TicketsModule {}
