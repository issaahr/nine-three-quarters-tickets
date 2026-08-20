import { JwtService } from '@nestjs/jwt';
import { compare, hash } from 'bcrypt';
import { QueryFailedError, Repository } from 'typeorm';

import { User } from '../users/user.entity';
import { UserRole } from '../users/userRole.enum';
import { AuthService } from './auth.service';
import { InvalidCredentialsError } from './errors/invalidCredentials.error';
import { EmailAlreadyRegisteredError } from './errors/emailAlreadyRegistered.error';

describe('AuthService', () => {
  const usersRepository = {
    create: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(),
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
    usersRepository.create.mockReset();
    usersRepository.findOne.mockReset();
    usersRepository.save.mockReset();
    jwtService.signAsync.mockReset();
  });

  it('cadastra uma conta CUSTOMER com senha hasheada e não expõe o hash', async () => {
    usersRepository.create.mockImplementation((data) => Object.assign(new User(), data));
    usersRepository.save.mockImplementation((data) =>
      Promise.resolve(
        Object.assign(data, {
          id: '00b6429d-7a09-4e34-8c58-5298617aaadd',
        }),
      ),
    );

    const response = await authService.signup({
      email: 'new.customer@ntq.local',
      password: 'valid-password',
    });

    const createdUser = usersRepository.create.mock.calls[0][0] as Partial<User>;

    expect(createdUser.role).toBe(UserRole.Customer);
    expect(createdUser.passwordHash).not.toBe('valid-password');
    await expect(compare('valid-password', createdUser.passwordHash!)).resolves.toBe(true);
    expect(response).toEqual({
      id: '00b6429d-7a09-4e34-8c58-5298617aaadd',
      email: 'new.customer@ntq.local',
      role: UserRole.Customer,
    });
    expect(response).not.toHaveProperty('passwordHash');
  });

  it('traduz somente a constraint de email duplicado', async () => {
    const driverError = Object.assign(new Error('duplicate key'), {
      code: '23505',
      constraint: 'usersEmailUnique',
    });

    usersRepository.create.mockImplementation((data) => Object.assign(new User(), data));
    usersRepository.save.mockRejectedValue(new QueryFailedError('INSERT', [], driverError));

    await expect(
      authService.signup({ email: 'existing@ntq.local', password: 'valid-password' }),
    ).rejects.toBeInstanceOf(EmailAlreadyRegisteredError);
  });

  it('não mascara falhas de persistência desconhecidas como email duplicado', async () => {
    const databaseError = new Error('database unavailable');

    usersRepository.create.mockImplementation((data) => Object.assign(new User(), data));
    usersRepository.save.mockRejectedValue(databaseError);

    await expect(
      authService.signup({ email: 'new.customer@ntq.local', password: 'valid-password' }),
    ).rejects.toBe(databaseError);
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
