import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class LoginRequestDto {
  @ApiProperty({ example: 'customer.one.demo@ntq.local', format: 'email' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail({}, { message: 'Email inválido' })
  @MaxLength(320, { message: 'Email inválido' })
  public email!: string;

  @ApiProperty({ example: '••••••••', format: 'password', writeOnly: true })
  @IsString({ message: 'Senha inválida' })
  @IsNotEmpty({ message: 'Senha inválida' })
  public password!: string;
}
