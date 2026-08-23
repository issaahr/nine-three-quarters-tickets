import { applyDecorators } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiQuery } from '@nestjs/swagger';

import { AdmissionMode } from '../events/admissionMode.enum';
import { VenueResponseDto } from './dto/venueResponse.dto';

/**
 * Agrupa a documentação HTTP da consulta aos Venues pré-configurados.
 */
export function ApiListVenues() {
  return applyDecorators(
    ApiOperation({ summary: 'Lista Venues disponíveis para criação de Events' }),
    ApiQuery({ name: 'admissionMode', required: false, enum: AdmissionMode }),
    ApiOkResponse({
      type: VenueResponseDto,
      isArray: true,
      description: 'Venues previamente configurados pela plataforma.',
    }),
  );
}
