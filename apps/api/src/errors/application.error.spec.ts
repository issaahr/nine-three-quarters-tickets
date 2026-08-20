import { HttpStatus } from '@nestjs/common';
import { ApplicationError } from './application.error';
import { ConfigurationError } from './configuration.error';

describe('ApplicationError', () => {
  it('usa erro interno como resposta base', () => {
    const error = new ApplicationError();

    expect(error.getStatus()).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(error.getResponse()).toEqual({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Erro interno da aplicação',
    });
  });

  it('mantém erros de configuração como erros internos identificáveis', () => {
    const error = new ConfigurationError('Configuração inválida');

    expect(error.getStatus()).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(error.getResponse()).toEqual({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      code: 'CONFIGURATION_ERROR',
      message: 'Configuração inválida',
    });
  });
});
