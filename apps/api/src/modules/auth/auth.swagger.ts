import { applyDecorators } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { ApplicationErrorResponseDto } from '../../errors/applicationErrorResponse.dto';
import { ValidationErrorResponseDto } from '../../errors/validationErrorResponse.dto';
import { LoginResponseDto } from './dto/loginResponse.dto';
import { SessionResponseDto } from './dto/sessionResponse.dto';
import { SignupResponseDto } from './dto/signupResponse.dto';

export function ApiSignup() {
  return applyDecorators(
    ApiOperation({ summary: 'Cria uma conta pública de cliente' }),
    ApiCreatedResponse({
      type: SignupResponseDto,
      description: 'Conta CUSTOMER criada sem iniciar uma sessão automaticamente.',
    }),
    ApiBadRequestResponse({
      type: ValidationErrorResponseDto,
      description: 'Email ou senha inválidos.',
    }),
    ApiConflictResponse({
      type: ApplicationErrorResponseDto,
      description: 'Email já cadastrado.',
    }),
    ApiNotFoundResponse({
      type: ApplicationErrorResponseDto,
      description: 'Cadastro público desabilitado.',
    }),
  );
}

export function ApiLogin() {
  return applyDecorators(
    ApiOperation({ summary: 'Autentica um usuário com email e senha' }),
    ApiOkResponse({
      type: LoginResponseDto,
      description: 'Usuário autenticado e JWT enviado exclusivamente por cookie HttpOnly.',
      headers: {
        'Set-Cookie': {
          description: 'Cookie accessToken contendo o JWT assinado.',
          schema: { type: 'string' },
        },
      },
    }),
    ApiBadRequestResponse({
      type: ValidationErrorResponseDto,
      description: 'Corpo da requisição inválido.',
    }),
    ApiUnauthorizedResponse({
      type: ApplicationErrorResponseDto,
      description: 'Email ou senha inválidos.',
    }),
  );
}

export function ApiGetSession() {
  return applyDecorators(
    ApiOperation({ summary: 'Consulta a identidade da sessão quando disponível' }),
    ApiOkResponse({
      type: SessionResponseDto,
      description: 'Identidade obtida das claims validadas do access token.',
    }),
    ApiNoContentResponse({
      description: 'Nenhuma sessão válida encontrada no cookie de autenticação.',
    }),
  );
}

export function ApiLogout() {
  return applyDecorators(
    ApiOperation({ summary: 'Encerra a sessão no navegador' }),
    ApiNoContentResponse({
      description: 'Cookie accessToken removido, mesmo que já estivesse ausente ou expirado.',
      headers: {
        'Set-Cookie': {
          description: 'Cookie accessToken expirado imediatamente.',
          schema: { type: 'string' },
        },
      },
    }),
  );
}
