import { Controller, Get, Inject, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/userRole.enum';
import { catalogProviderToken } from './catalog.constants';
import { ApiSearchMovies } from './catalog.swagger';
import { CatalogProvider } from './catalogProvider';
import { CatalogItemResponseDto } from './dto/catalogItemResponse.dto';
import { SearchMoviesQueryDto } from './dto/searchMoviesQuery.dto';

@ApiTags('Catalog')
@Controller('catalog')
export class CatalogController {
  public constructor(
    @Inject(catalogProviderToken)
    private readonly catalogProvider: CatalogProvider,
  ) {}

  /**
   * Encaminha uma consulta validada ao provider sem expor seu formato externo.
   */
  @Get('movies')
  @Roles(UserRole.Organizer)
  @ApiSearchMovies()
  public searchMovies(@Query() query: SearchMoviesQueryDto): Promise<CatalogItemResponseDto[]> {
    return this.catalogProvider.search(query.query);
  }
}
