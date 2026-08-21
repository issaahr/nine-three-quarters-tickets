import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { EventCategory } from '../../events/eventCategory.enum';
import { CatalogItem } from '../catalogItem';
import { CatalogSource } from '../catalogSource.enum';

export class CatalogItemResponseDto {
  @ApiProperty({ enum: CatalogSource })
  public source!: CatalogSource;

  @ApiProperty({ example: '693134' })
  public externalId!: string;

  @ApiProperty({ enum: EventCategory })
  public category!: EventCategory;

  @ApiProperty({ example: 'Duna: Parte Dois' })
  public title!: string;

  @ApiPropertyOptional()
  public description?: string;

  @ApiPropertyOptional({ format: 'uri' })
  public imageUrl?: string;

  @ApiProperty({ type: [String], example: ['Ficção científica', 'Aventura'] })
  public genres!: string[];

  /**
   * Converte o contrato normalizado da port para o contrato HTTP público.
   *
   * @param item - Item já normalizado pelo provider de catálogo.
   * @returns Campos de catálogo permitidos na resposta da API.
   */
  public static fromCatalogItem(item: CatalogItem): CatalogItemResponseDto {
    return {
      source: item.source,
      externalId: item.externalId,
      category: item.category,
      title: item.title,
      description: item.description,
      imageUrl: item.imageUrl,
      genres: item.genres,
    };
  }
}
