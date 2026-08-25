import { Controller, Get, Param, Query, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { AuthenticatedRequest } from '../auth/auth.types';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/userRole.enum';
import { ListTicketsQueryDto } from './dto/listTicketsQuery.dto';
import { TicketPurchasesPageResponseDto } from './dto/ticketPurchasesPageResponse.dto';
import { SharedTicketResponseDto } from './dto/ticketResponse.dto';
import { ApiGetSharedTicket, ApiListTickets } from './tickets.swagger';
import { TicketsService } from './tickets.service';

@ApiTags('Tickets')
@Controller('tickets')
export class TicketsController {
  public constructor(private readonly ticketsService: TicketsService) {}

  /** Lista compras confirmadas do CUSTOMER sem expor Tickets de outras contas com paginação server-side. */
  @Get()
  @Roles(UserRole.Customer)
  @ApiListTickets()
  public async listOwned(
    @Req() request: AuthenticatedRequest,
    @Query() query: ListTicketsQueryDto,
  ): Promise<TicketPurchasesPageResponseDto> {
    const page = await this.ticketsService.listOwned(request.user.id, query);
    return TicketPurchasesPageResponseDto.fromPurchases(page.items, page.page, page.hasMore);
  }

  /** Apresenta um único Ticket ao portador de uma credencial HMAC válida. */
  @Get('shared/:credential')
  @ApiGetSharedTicket()
  public async findShared(
    @Param('credential') credential: string,
  ): Promise<SharedTicketResponseDto> {
    const ticket = await this.ticketsService.findShared(credential);
    return SharedTicketResponseDto.fromDetails(ticket);
  }
}
