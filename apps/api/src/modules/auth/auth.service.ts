import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { compare } from 'bcrypt';
import { Repository } from 'typeorm';

import { User } from '../users/user.entity';
import { LoginRequestDto } from './dto/loginRequest.dto';
import { InvalidCredentialsError } from './errors/invalidCredentials.error';
import { AccessTokenPayload, AuthenticatedSession } from './auth.types';

/**
 * Mantém o custo do bcrypt mesmo quando o email não existe, reduzindo diferenças
 * de tempo que poderiam revelar quais contas estão cadastradas.
 */
const dummyPasswordHash = '$2b$12$2BWmKp9n7ChY58WAaN7nnusCGp9n.X68RJbIVhbRzwhKGQg2OgGRC';

@Injectable()
export class AuthService {
  public constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    private readonly jwtService: JwtService,
  ) {}

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
