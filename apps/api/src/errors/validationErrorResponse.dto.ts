import { ApiProperty } from '@nestjs/swagger';

export class ValidationErrorResponseDto {
  @ApiProperty({ example: 400 })
  public statusCode!: number;

  @ApiProperty({ example: ['Email inválido', 'Senha inválida'], isArray: true })
  public message!: string[];

  @ApiProperty({ example: 'Bad Request' })
  public error!: string;
}
