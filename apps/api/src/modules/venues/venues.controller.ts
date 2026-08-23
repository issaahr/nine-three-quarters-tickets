import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/userRole.enum';
import { ListVenuesQueryDto } from './dto/listVenuesQuery.dto';
import { VenueResponseDto } from './dto/venueResponse.dto';
import { Venue } from './venue.entity';
import { ApiListVenues } from './venues.swagger';

@ApiTags('Venues')
@Controller('venues')
export class VenuesController {
  public constructor(
    @InjectRepository(Venue)
    private readonly venuesRepository: Repository<Venue>,
  ) {}

  /**
   * Lista os Venues configurados sem introduzir uma camada de serviço delegadora.
   */
  @Get()
  @Roles(UserRole.Organizer)
  @ApiListVenues()
  public async list(@Query() query: ListVenuesQueryDto): Promise<VenueResponseDto[]> {
    const venues = await this.venuesRepository.find({
      where: query.admissionMode ? { admissionMode: query.admissionMode } : undefined,
      order: { name: 'ASC' },
    });
    return venues.map(VenueResponseDto.fromVenue);
  }
}
