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
import { EventDetailResponseDto } from './dto/eventDetailResponse.dto';
import { EventDiscoveryPageResponseDto } from './dto/eventDiscoveryPageResponse.dto';
import { EventMutationResponseDto } from './dto/eventMutationResponse.dto';
import { EventSeatMapItemResponseDto } from './dto/eventSeatMapItemResponse.dto';
import { GateEventResponseDto } from './dto/gateEventResponse.dto';
import { GateEventsPageResponseDto } from './dto/gateEventsPageResponse.dto';
import { OrganizerEventsPageResponseDto } from './dto/organizerEventsPageResponse.dto';

/**
 * Agrupa a documentação HTTP da descoberta pública de ocorrências.
 */
export function ApiDiscoverEvents() {
  return applyDecorators(
    ApiOperation({ summary: 'Descobre Events publicados e futuros' }),
    ApiOkResponse({
      type: EventDiscoveryPageResponseDto,
      description: 'Página ordenada de ocorrências construídas somente com dados locais.',
    }),
    ApiBadRequestResponse({
      description: 'Busca, filtros, período ou página inválidos.',
    }),
  );
}

/**
 * Agrupa a documentação HTTP da leitura pública de uma ocorrência.
 */
export function ApiGetEventDetail() {
  return applyDecorators(
    ApiOperation({ summary: 'Consulta uma ocorrência pública pelo identificador' }),
    ApiOkResponse({
      type: EventDetailResponseDto,
      description: 'Conteúdo persistido, estado e horário local de uma única ocorrência.',
    }),
    ApiBadRequestResponse({
      type: ValidationErrorResponseDto,
      description: 'Identificador inválido.',
    }),
    ApiNotFoundResponse({
      type: ApplicationErrorResponseDto,
      description: 'Event inexistente ou ainda em DRAFT.',
    }),
  );
}

/** Agrupa a documentação HTTP do mapa seated materializado de uma ocorrência. */
export function ApiGetEventSeatMap() {
  return applyDecorators(
    ApiOperation({ summary: 'Consulta o mapa público de assentos de uma ocorrência' }),
    ApiOkResponse({
      type: EventSeatMapItemResponseDto,
      isArray: true,
      description: 'Layout persistido com disponibilidade temporal calculada pelo PostgreSQL.',
    }),
    ApiBadRequestResponse({
      type: ValidationErrorResponseDto,
      description: 'Identificador inválido.',
    }),
    ApiNotFoundResponse({
      type: ApplicationErrorResponseDto,
      description: 'Event inexistente, em DRAFT ou sem mapa seated público.',
    }),
  );
}

/**
 * Agrupa a documentação HTTP específica da criação de Events de filme.
 */
export function ApiCreateMovieEvent() {
  return applyDecorators(
    ApiOperation({ summary: 'Cria um Event de filme em estado DRAFT' }),
    ApiCreatedResponse({
      type: EventMutationResponseDto,
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
    ApiConflictResponse({
      type: ApplicationErrorResponseDto,
      description: 'Venue incompatível com inventário SEATED.',
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

/** Agrupa a documentação HTTP específica da criação de Events de show. */
export function ApiCreateShowEvent() {
  return applyDecorators(
    ApiOperation({ summary: 'Cria um Event de show GENERAL_ADMISSION em estado DRAFT' }),
    ApiCreatedResponse({
      type: EventMutationResponseDto,
      description: 'Event criado com snapshot da Ticketmaster e inventário local agregado.',
    }),
    ApiBadRequestResponse({
      type: ValidationErrorResponseDto,
      description: 'Payload, capacidade ou horário local inválido para o Venue.',
    }),
    ApiNotFoundResponse({
      type: ApplicationErrorResponseDto,
      description: 'Venue ou atração não encontrada.',
    }),
    ApiConflictResponse({
      type: ApplicationErrorResponseDto,
      description: 'Venue incompatível com entrada GENERAL_ADMISSION.',
    }),
    ApiBadGatewayResponse({
      type: ApplicationErrorResponseDto,
      description: 'Ticketmaster indisponível ou respondeu em formato incompatível.',
    }),
    ApiGatewayTimeoutResponse({
      type: ApplicationErrorResponseDto,
      description: 'Ticketmaster excedeu o tempo configurado para resposta.',
    }),
  );
}

/**
 * Agrupa a documentação HTTP específica da publicação de um Event.
 */
export function ApiPublishEvent() {
  return applyDecorators(
    ApiOperation({ summary: 'Publica um Event e prepara seu inventário local' }),
    ApiOkResponse({
      type: EventMutationResponseDto,
      description: 'Event publicado; assentos são materializados somente na modalidade SEATED.',
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
    ApiOperation({ summary: 'Lista os Events do organizador autenticado com paginação' }),
    ApiOkResponse({
      type: OrganizerEventsPageResponseDto,
      description: 'Página de rascunhos, Events publicados e históricos do próprio organizador.',
    }),
    ApiBadRequestResponse({
      type: ValidationErrorResponseDto,
      description: 'Parâmetros de paginação inválidos.',
    }),
  );
}

/** Agrupa a documentação HTTP da seleção de contexto pela portaria. */
export function ApiListGateEvents() {
  return applyDecorators(
    ApiOperation({ summary: 'Lista Events publicados operáveis pela portaria com paginação' }),
    ApiOkResponse({
      type: GateEventsPageResponseDto,
      description:
        'Página de ocorrências publicadas, com indicador determinístico de mais páginas.',
    }),
    ApiBadRequestResponse({
      type: ValidationErrorResponseDto,
      description: 'Parâmetros de paginação inválidos.',
    }),
  );
}

/** Agrupa a documentação HTTP da consulta contextual de um evento pela portaria. */
export function ApiGetGateEvent() {
  return applyDecorators(
    ApiOperation({ summary: 'Obtém dados contextuais de um Event publicado para a portaria' }),
    ApiOkResponse({
      type: GateEventResponseDto,
      description: 'Ocorrência publicada carregada com seu local para operação.',
    }),
    ApiBadRequestResponse({
      type: ValidationErrorResponseDto,
      description: 'Identificador de evento inválido.',
    }),
    ApiNotFoundResponse({
      type: ApplicationErrorResponseDto,
      description: 'Event inexistente ou não publicado.',
    }),
  );
}
