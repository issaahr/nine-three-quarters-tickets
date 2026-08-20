import { applyDecorators } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiOkResponse,
  ApiOperation,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { ApplicationErrorResponseDto } from '../../errors/applicationErrorResponse.dto';
import { ValidationErrorResponseDto } from '../../errors/validationErrorResponse.dto';
import { LoginResponseDto } from './dto/loginResponse.dto';

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
