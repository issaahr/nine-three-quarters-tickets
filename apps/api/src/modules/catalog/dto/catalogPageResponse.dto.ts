import { ApiProperty } from '@nestjs/swagger';

import { CatalogPage } from '../catalogPage';
import { CatalogItemResponseDto } from './catalogItemResponse.dto';

export class CatalogPageResponseDto {
  @ApiProperty({ type: CatalogItemResponseDto, isArray: true })
  public items!: CatalogItemResponseDto[];

  @ApiProperty({ minimum: 1 })
  public page!: number;

  @ApiProperty()
  public hasMore!: boolean;

  /**
   * Delimita a página da port antes de entregá-la como resposta HTTP.
   *
   * @param page - Página normalizada retornada pelo provider.
   * @returns Contrato público paginado do catálogo.
   */
  public static fromCatalogPage(page: CatalogPage): CatalogPageResponseDto {
    return {
      items: page.items.map(CatalogItemResponseDto.fromCatalogItem),
      page: page.page,
      hasMore: page.hasMore,
    };
  }
}
