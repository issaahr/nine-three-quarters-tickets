import { applyDecorators } from '@nestjs/common';
import {
  ApiBadGatewayResponse,
  ApiBadRequestResponse,
  ApiCreatedResponse,
  ApiGatewayTimeoutResponse,
  ApiNotFoundResponse,
  ApiOperation,
} from '@nestjs/swagger';

import { ApplicationErrorResponseDto } from '../../errors/applicationErrorResponse.dto';
import { ValidationErrorResponseDto } from '../../errors/validationErrorResponse.dto';
import { CreateMovieEventResponseDto } from './dto/createMovieEventResponse.dto';

/**
 * Agrupa a documentação HTTP específica da criação de Events de filme.
 */
export function ApiCreateMovieEvent() {
  return applyDecorators(
    ApiOperation({ summary: 'Cria um Event de filme em estado DRAFT' }),
    ApiCreatedResponse({
      type: CreateMovieEventResponseDto,
      description: 'Event criado com snapshot confiável da TMDb e horário do Venue.',
    }),
    ApiBadRequestResponse({
      type: ValidationErrorResponseDto,
      description: 'Payload ou horário local inválido para o Venue.',
    }),
    ApiNotFoundResponse({
      type: ApplicationErrorResponseDto,
      description: 'Venue ou filme não encontrado.',
    }),
    ApiBadGatewayResponse({
      type: ApplicationErrorResponseDto,
      description: 'TMDb indisponível ou respondeu em formato incompatível.',
    }),
    ApiGatewayTimeoutResponse({
      type: ApplicationErrorResponseDto,
      description: 'TMDb excedeu o tempo configurado para resposta.',
    }),
  );
}
