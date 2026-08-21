import { applyDecorators } from '@nestjs/common';
import {
  ApiBadGatewayResponse,
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiGatewayTimeoutResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
} from '@nestjs/swagger';

import { ApplicationErrorResponseDto } from '../../errors/applicationErrorResponse.dto';
import { ValidationErrorResponseDto } from '../../errors/validationErrorResponse.dto';
import { CreateMovieEventResponseDto } from './dto/createMovieEventResponse.dto';
import { OrganizerEventResponseDto } from './dto/organizerEventResponse.dto';

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

/**
 * Agrupa a documentação HTTP específica da publicação de um Event.
 */
export function ApiPublishEvent() {
  return applyDecorators(
    ApiOperation({ summary: 'Publica um Event e materializa seus assentos' }),
    ApiOkResponse({
      type: CreateMovieEventResponseDto,
      description: 'Event publicado com um EventSeat para cada assento do Venue.',
    }),
    ApiBadRequestResponse({
      type: ApplicationErrorResponseDto,
      description: 'Identificador ou horário do Event inválido.',
    }),
    ApiNotFoundResponse({
      type: ApplicationErrorResponseDto,
      description: 'Event inexistente ou pertencente a outro organizador.',
    }),
    ApiConflictResponse({
      type: ApplicationErrorResponseDto,
      description: 'Estado do Event ou layout do Venue incompatível com a publicação.',
    }),
  );
}

/**
 * Agrupa a documentação HTTP da listagem privada do organizador autenticado.
 */
export function ApiListOrganizerEvents() {
  return applyDecorators(
    ApiOperation({ summary: 'Lista os Events do organizador autenticado' }),
    ApiOkResponse({
      type: OrganizerEventResponseDto,
      isArray: true,
      description: 'Rascunhos, Events publicados e históricos do próprio organizador.',
    }),
  );
}
