import { Controller, Get, Inject, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/userRole.enum';
import { catalogProviderToken } from './catalog.constants';
import { ApiListPopularMovies, ApiSearchMovies } from './catalog.swagger';
import { CatalogProvider } from './catalogProvider';
import { CatalogPageResponseDto } from './dto/catalogPageResponse.dto';
import { ListPopularMoviesQueryDto } from './dto/listPopularMoviesQuery.dto';
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
  public async searchMovies(@Query() query: SearchMoviesQueryDto): Promise<CatalogPageResponseDto> {
    const page = await this.catalogProvider.search(query.query, query.page);
    return CatalogPageResponseDto.fromCatalogPage(page);
  }

  /**
   * Fornece a descoberta inicial paginada sem transformar a TMDb em autoridade local.
   */
  @Get('movies/popular')
  @Roles(UserRole.Organizer)
  @ApiListPopularMovies()
  public async listPopularMovies(
    @Query() query: ListPopularMoviesQueryDto,
  ): Promise<CatalogPageResponseDto> {
    const page = await this.catalogProvider.listPopular(query.page);
    return CatalogPageResponseDto.fromCatalogPage(page);
  }
}
