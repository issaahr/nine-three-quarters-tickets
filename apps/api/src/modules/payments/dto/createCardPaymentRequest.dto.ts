import { Transform } from 'class-transformer';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateCardPaymentRequestDto {
  @ApiProperty({ example: '4242 4242 4242 4242' })
  @Transform(({ value }) => (typeof value === 'string' ? value.replace(/\s+/g, '') : value))
  @IsString()
  @Matches(/^\d{13,19}$/, { message: 'Número do cartão inválido' })
  public cardNumber!: string;

  @ApiProperty({ example: 'Ana Beatriz Souza' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  public cardholderName!: string;

  @ApiProperty({ example: '08/29' })
  @IsString()
  @Matches(/^(0[1-9]|1[0-2])\/\d{2}$/, { message: 'Validade do cartão inválida' })
  public expiry!: string;

  @ApiProperty({ example: '123' })
  @IsString()
  @Matches(/^\d{3,4}$/, { message: 'CVV inválido' })
  public cvv!: string;
}
