import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { EventCategory } from '../../events/eventCategory.enum';
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
}
