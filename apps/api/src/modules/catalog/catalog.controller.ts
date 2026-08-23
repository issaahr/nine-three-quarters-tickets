import { Controller, Get, Inject, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/userRole.enum';
import { movieCatalogProviderToken, showCatalogProviderToken } from './catalog.constants';
import {
  ApiListPopularMovies,
  ApiListRelevantAttractions,
  ApiSearchAttractions,
  ApiSearchMovies,
} from './catalog.swagger';
import { MovieCatalogProvider, ShowCatalogProvider } from './catalogProvider';
import { CatalogPageResponseDto } from './dto/catalogPageResponse.dto';
import { ListPopularMoviesQueryDto } from './dto/listPopularMoviesQuery.dto';
import { ListRelevantAttractionsQueryDto } from './dto/listRelevantAttractionsQuery.dto';
import { SearchAttractionsQueryDto } from './dto/searchAttractionsQuery.dto';
import { SearchMoviesQueryDto } from './dto/searchMoviesQuery.dto';

@ApiTags('Catalog')
@Controller('catalog')
export class CatalogController {
  public constructor(
    @Inject(movieCatalogProviderToken)
    private readonly movieCatalogProvider: MovieCatalogProvider,
    @Inject(showCatalogProviderToken)
    private readonly showCatalogProvider: ShowCatalogProvider,
  ) {}

  /**
   * Encaminha uma consulta validada ao provider sem expor seu formato externo.
   */
  @Get('movies')
  @Roles(UserRole.Organizer)
  @ApiSearchMovies()
  public async searchMovies(@Query() query: SearchMoviesQueryDto): Promise<CatalogPageResponseDto> {
    const page = await this.movieCatalogProvider.search(query.query, query.page);
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
    const page = await this.movieCatalogProvider.listPopular(query.page);
    return CatalogPageResponseDto.fromCatalogPage(page);
  }

  /** Fornece a descoberta inicial sem confundir ocorrências externas com inventário local. */
  @Get('attractions/relevant')
  @Roles(UserRole.Organizer)
  @ApiListRelevantAttractions()
  public async listRelevantAttractions(
    @Query() query: ListRelevantAttractionsQueryDto,
  ): Promise<CatalogPageResponseDto> {
    const page = await this.showCatalogProvider.listRelevantInBrazil(query.page);
    return CatalogPageResponseDto.fromCatalogPage(page);
  }

  /**
   * Encaminha a pesquisa de atrações ao provider sem importar eventos ou inventário externos.
   */
  @Get('attractions')
  @Roles(UserRole.Organizer)
  @ApiSearchAttractions()
  public async searchAttractions(
    @Query() query: SearchAttractionsQueryDto,
  ): Promise<CatalogPageResponseDto> {
    const page = await this.showCatalogProvider.search(query.query, query.page);
    return CatalogPageResponseDto.fromCatalogPage(page);
  }
}
