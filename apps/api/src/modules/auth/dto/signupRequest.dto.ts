import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

import { MaxUtf8ByteLength } from '../validators/maxUtf8ByteLength.validator';

export class SignupRequestDto {
  @ApiProperty({ example: 'cliente@email.com', format: 'email' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail({}, { message: 'Email inválido' })
  @MaxLength(320, { message: 'Email inválido' })
  public email!: string;

  @ApiProperty({ example: '••••••••', format: 'password', minLength: 8, writeOnly: true })
  @MinLength(8, { message: 'Senha deve possuir ao menos 8 caracteres' })
  @MaxUtf8ByteLength(72, { message: 'Senha deve possuir no máximo 72 bytes' })
  @IsString({ message: 'Senha inválida' })
  public password!: string;
}
