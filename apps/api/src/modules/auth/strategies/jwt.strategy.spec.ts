import { UserRole } from '../../users/userRole.enum';
import { AuthenticationRequiredError } from '../errors/authenticationRequired.error';
import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy', () => {
  const strategy = new JwtStrategy();

  it('converte claims válidas no usuário autenticado da requisição', () => {
    expect(
      strategy.validate({
        sub: '25c9813c-6909-4b7c-bd75-8bc0090a33a0',
        role: UserRole.Customer,
      }),
    ).toEqual({
      id: '25c9813c-6909-4b7c-bd75-8bc0090a33a0',
      role: UserRole.Customer,
    });
  });

  it.each([
    null,
    {},
    { sub: 'invalid-id', role: UserRole.Customer },
    { sub: '25c9813c-6909-4b7c-bd75-8bc0090a33a0', role: 'ADMIN' },
  ])('rejeita claims controladas inválidas', (payload) => {
    expect(() => strategy.validate(payload)).toThrow(AuthenticationRequiredError);
  });
});
