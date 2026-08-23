import { applyDecorators } from '@nestjs/common';
import {
  ApiBadGatewayResponse,
  ApiBadRequestResponse,
  ApiGatewayTimeoutResponse,
  ApiOkResponse,
  ApiOperation,
} from '@nestjs/swagger';

import { ApplicationErrorResponseDto } from '../../errors/applicationErrorResponse.dto';
import { ValidationErrorResponseDto } from '../../errors/validationErrorResponse.dto';
import { CatalogPageResponseDto } from './dto/catalogPageResponse.dto';

/**
 * Agrupa a documentação HTTP específica da pesquisa de filmes.
 */
export function ApiSearchMovies() {
  return applyDecorators(
    ApiOperation({ summary: 'Pesquisa filmes no catálogo da TMDb' }),
    ApiOkResponse({
      type: CatalogPageResponseDto,
      description: 'Filmes normalizados sem preço, horário ou inventário externo.',
    }),
    ApiBadRequestResponse({
      type: ValidationErrorResponseDto,
      description: 'Consulta ausente ou inválida.',
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
 * Agrupa a documentação HTTP específica da descoberta inicial de filmes.
 */
export function ApiListPopularMovies() {
  return applyDecorators(
    ApiOperation({ summary: 'Lista filmes populares da TMDb' }),
    ApiOkResponse({
      type: CatalogPageResponseDto,
      description: 'Página de filmes normalizados para seleção pelo organizador.',
    }),
    ApiBadRequestResponse({
      type: ValidationErrorResponseDto,
      description: 'Página ausente ou inválida.',
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
 * Agrupa a documentação HTTP específica da pesquisa de atrações.
 */
export function ApiSearchAttractions() {
  return applyDecorators(
    ApiOperation({ summary: 'Pesquisa atrações no catálogo da Ticketmaster' }),
    ApiOkResponse({
      type: CatalogPageResponseDto,
      description: 'Atrações normalizadas sem preço, horário, capacidade ou inventário externo.',
    }),
    ApiBadRequestResponse({
      type: ValidationErrorResponseDto,
      description: 'Consulta ausente ou inválida.',
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

/** Agrupa a documentação da descoberta regional inicial de atrações musicais. */
export function ApiListRelevantAttractions() {
  return applyDecorators(
    ApiOperation({ summary: 'Lista atrações de eventos musicais relevantes no Brasil' }),
    ApiOkResponse({
      type: CatalogPageResponseDto,
      description: 'Atrações principais normalizadas a partir de eventos relevantes no Brasil.',
    }),
    ApiBadRequestResponse({
      type: ValidationErrorResponseDto,
      description: 'Página ausente ou inválida.',
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
