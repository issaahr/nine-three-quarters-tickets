import { applyDecorators } from '@nestjs/common';
import { ApiOkResponse, ApiOperation } from '@nestjs/swagger';

import { VenueResponseDto } from './dto/venueResponse.dto';

/**
 * Agrupa a documentação HTTP da consulta aos Venues pré-configurados.
 */
export function ApiListVenues() {
  return applyDecorators(
    ApiOperation({ summary: 'Lista Venues disponíveis para criação de Events' }),
    ApiOkResponse({
      type: VenueResponseDto,
      isArray: true,
      description: 'Venues previamente configurados pela plataforma.',
    }),
  );
}
