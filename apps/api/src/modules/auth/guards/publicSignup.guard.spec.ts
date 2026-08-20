import { PublicSignupUnavailableError } from '../errors/publicSignupUnavailable.error';
import { PublicSignupGuard } from './publicSignup.guard';

describe('PublicSignupGuard', () => {
  it('permite cadastro quando a flag está habilitada', () => {
    expect(new PublicSignupGuard(true).canActivate()).toBe(true);
  });

  it('oculta o endpoint quando a flag está desabilitada', () => {
    expect(() => new PublicSignupGuard(false).canActivate()).toThrow(PublicSignupUnavailableError);
  });
});
