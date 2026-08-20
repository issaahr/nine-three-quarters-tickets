import { ApiProperty } from '@nestjs/swagger';

export class ApplicationErrorResponseDto {
  @ApiProperty({ example: 401 })
  public statusCode!: number;

  @ApiProperty({ example: 'INVALID_CREDENTIALS' })
  public code!: string;

  @ApiProperty({ example: 'Credenciais inválidas' })
  public message!: string;
}
