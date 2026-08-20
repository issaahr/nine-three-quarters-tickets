import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { compare, hash } from 'bcrypt';
import { QueryFailedError, Repository } from 'typeorm';

import { User } from '../users/user.entity';
import { UserRole } from '../users/userRole.enum';
import { LoginRequestDto } from './dto/loginRequest.dto';
import { SignupRequestDto } from './dto/signupRequest.dto';
import { SignupResponseDto } from './dto/signupResponse.dto';
import { EmailAlreadyRegisteredError } from './errors/emailAlreadyRegistered.error';
import { InvalidCredentialsError } from './errors/invalidCredentials.error';
import { AccessTokenPayload, AuthenticatedSession } from './auth.types';

/**
 * Mantém o custo do bcrypt mesmo quando o email não existe, reduzindo diferenças
 * de tempo que poderiam revelar quais contas estão cadastradas.
 */
const dummyPasswordHash = '$2b$12$2BWmKp9n7ChY58WAaN7nnusCGp9n.X68RJbIVhbRzwhKGQg2OgGRC';
const bcryptSaltRounds = 12;

/** Reconhece exclusivamente a constraint que representa email duplicado em User. */
function isUsersEmailUniqueViolation(error: unknown): boolean {
  if (!(error instanceof QueryFailedError)) {
    return false;
  }

  const driverError = error.driverError as Record<string, unknown>;

  return driverError.code === '23505' && driverError.constraint === 'usersEmailUnique';
}

@Injectable()
export class AuthService {
  public constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    private readonly jwtService: JwtService,
  ) {}

  /**
   * Cria uma conta pública sempre como CUSTOMER e delega ao PostgreSQL a decisão
   * atômica sobre unicidade do email.
   */
  public async signup(data: SignupRequestDto): Promise<SignupResponseDto> {
    const user = this.usersRepository.create({
      email: data.email,
      passwordHash: await hash(data.password, bcryptSaltRounds),
      role: UserRole.Customer,
    });

    try {
      const savedUser = await this.usersRepository.save(user);

      return {
        id: savedUser.id,
        email: savedUser.email,
        role: UserRole.Customer,
      };
    } catch (error) {
      if (isUsersEmailUniqueViolation(error)) {
        throw new EmailAlreadyRegisteredError(error);
      }

      throw error;
    }
  }

  /**
   * Autentica credenciais já normalizadas pelo DTO e responde de forma idêntica
   * para email inexistente e senha incorreta.
   */
  public async login(credentials: LoginRequestDto): Promise<AuthenticatedSession> {
    const user = await this.usersRepository.findOne({
      where: { email: credentials.email },
      select: {
        id: true,
        email: true,
        passwordHash: true,
        role: true,
      },
    });
    const passwordMatches = await compare(
      credentials.password,
      user?.passwordHash ?? dummyPasswordHash,
    );

    if (!user || !passwordMatches) {
      throw new InvalidCredentialsError();
    }

    const payload: AccessTokenPayload = {
      sub: user.id,
      role: user.role,
    };

    return {
      accessToken: await this.jwtService.signAsync(payload),
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
    };
  }
}
