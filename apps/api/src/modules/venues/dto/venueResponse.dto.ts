import { ApiProperty } from '@nestjs/swagger';

import { AdmissionMode } from '../../events/admissionMode.enum';
import { Venue } from '../venue.entity';

export class VenueResponseDto {
  @ApiProperty({ format: 'uuid' })
  public id!: string;

  @ApiProperty()
  public name!: string;

  @ApiProperty()
  public address!: string;

  @ApiProperty()
  public city!: string;

  @ApiProperty()
  public state!: string;

  @ApiProperty()
  public country!: string;

  @ApiProperty({ example: 'America/Sao_Paulo' })
  public timeZone!: string;

  @ApiProperty({ enum: AdmissionMode })
  public admissionMode!: AdmissionMode;

  /**
   * Limita a resposta aos dados necessários para escolha e interpretação do horário.
   *
   * @param venue - Venue pré-configurado pela plataforma.
   * @returns Contrato público utilizado pelo formulário do organizador.
   */
  public static fromVenue(venue: Venue): VenueResponseDto {
    return {
      id: venue.id,
      name: venue.name,
      address: venue.address,
      city: venue.city,
      state: venue.state,
      country: venue.country,
      timeZone: venue.timeZone,
      admissionMode: venue.admissionMode,
    };
  }
}
