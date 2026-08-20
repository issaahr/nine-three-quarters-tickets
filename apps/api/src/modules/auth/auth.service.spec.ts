import { JwtService } from '@nestjs/jwt';
import { hash } from 'bcrypt';
import { Repository } from 'typeorm';

import { User } from '../users/user.entity';
import { UserRole } from '../users/userRole.enum';
import { AuthService } from './auth.service';
import { InvalidCredentialsError } from './errors/invalidCredentials.error';

describe('AuthService', () => {
  const usersRepository = {
    findOne: jest.fn(),
  };
  const jwtService = {
    signAsync: jest.fn(),
  };
  const authService = new AuthService(
    usersRepository as unknown as Repository<User>,
    jwtService as unknown as JwtService,
  );

  let user: User;

  beforeAll(async () => {
    user = Object.assign(new User(), {
      id: '25c9813c-6909-4b7c-bd75-8bc0090a33a0',
      email: 'customer.one.demo@ntq.local',
      passwordHash: await hash('valid-password', 4),
      role: UserRole.Customer,
    });
  });

  beforeEach(() => {
    usersRepository.findOne.mockReset();
    jwtService.signAsync.mockReset();
  });

  it('consulta o hash explicitamente e retorna uma sessão sem expô-lo', async () => {
    usersRepository.findOne.mockResolvedValue(user);
    jwtService.signAsync.mockResolvedValue('signed-token');

    const session = await authService.login({
      email: 'customer.one.demo@ntq.local',
      password: 'valid-password',
    });

    expect(usersRepository.findOne).toHaveBeenCalledWith({
      where: { email: 'customer.one.demo@ntq.local' },
      select: {
        id: true,
        email: true,
        passwordHash: true,
        role: true,
      },
    });
    expect(jwtService.signAsync).toHaveBeenCalledWith({
      sub: user.id,
      role: UserRole.Customer,
    });
    expect(session).toEqual({
      accessToken: 'signed-token',
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
    });
    expect(session.user).not.toHaveProperty('passwordHash');
  });

  it('rejeita senha incorreta com erro uniforme', async () => {
    usersRepository.findOne.mockResolvedValue(user);

    await expect(
      authService.login({ email: user.email, password: 'invalid-password' }),
    ).rejects.toBeInstanceOf(InvalidCredentialsError);
  });

  it('rejeita email inexistente com o mesmo erro', async () => {
    usersRepository.findOne.mockResolvedValue(null);

    await expect(
      authService.login({ email: 'missing@ntq.local', password: 'invalid-password' }),
    ).rejects.toBeInstanceOf(InvalidCredentialsError);
  });
});
