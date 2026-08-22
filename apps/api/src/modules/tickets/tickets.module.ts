import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Ticket } from './ticket.entity';
import { TicketCredentialService } from './ticketCredential.service';
import { GateTicketsController } from './gateTickets.controller';
import { TicketRepository } from './repositories/ticket.repository';
import { TicketsController } from './tickets.controller';
import { TicketsService } from './tickets.service';

@Module({
  imports: [TypeOrmModule.forFeature([Ticket])],
  controllers: [TicketsController, GateTicketsController],
  providers: [TicketCredentialService, TicketRepository, TicketsService],
  exports: [TicketCredentialService, TicketsService],
})
export class TicketsModule {}
