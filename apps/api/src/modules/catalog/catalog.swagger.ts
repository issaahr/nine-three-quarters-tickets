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
import { CatalogItemResponseDto } from './dto/catalogItemResponse.dto';

/**
 * Agrupa a documentação HTTP específica da pesquisa de filmes.
 */
export function ApiSearchMovies() {
  return applyDecorators(
    ApiOperation({ summary: 'Pesquisa filmes no catálogo da TMDb' }),
    ApiOkResponse({
      type: CatalogItemResponseDto,
      isArray: true,
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
