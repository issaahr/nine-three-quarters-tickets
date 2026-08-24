import { zodResolver } from '@hookform/resolvers/zod';
import axios from 'axios';
import { Eye, EyeOff } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { isApiRateLimitError, rateLimitErrorMessage } from '@/lib/api';
import { AuthPageLayout } from '../components/AuthPageLayout';
import { useAuth, useSignup } from '../hooks';
import { SignupFormValues, signupSchema } from '../schemas';

/** Traduz falhas esperadas do cadastro sem expor detalhes internos da persistência. */
function getSignupErrorMessage(error: unknown): string | null {
  if (!error) {
    return null;
  }

  if (axios.isAxiosError(error) && error.response?.status === 409) {
    return 'Já existe uma conta com este e-mail.';
  }

  if (axios.isAxiosError(error) && error.response?.status === 404) {
    return 'O cadastro público está indisponível.';
  }

  if (isApiRateLimitError(error)) {
    return rateLimitErrorMessage;
  }

  return 'Não foi possível criar sua conta. Tente novamente em instantes.';
}

export function Signup() {
  const navigate = useNavigate();
  const { signup, isSigningUp, signupError } = useSignup();
  const { isAuthenticated } = useAuth({ restoreSession: false });
  const [showPassword, setShowPassword] = useState(false);
  const [showPasswordConfirmation, setShowPasswordConfirmation] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isValid },
  } = useForm<SignupFormValues>({
    resolver: zodResolver(signupSchema),
    mode: 'onChange',
  });

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/');
    }
  }, [isAuthenticated, navigate]);

  const onSubmit = async ({ email, password }: SignupFormValues) => {
    try {
      await signup({ email, password });
      navigate('/login', { replace: true, state: { signupCompleted: true } });
    } catch {
      // A mensagem correspondente é obtida do estado da mutation.
    }
  };

  const signupErrorMessage = getSignupErrorMessage(signupError);
  const fieldClassName =
    'w-full bg-background rounded-[4px] px-[14px] py-[12px] h-auto font-sans text-[14px] text-foreground border-border';
  const labelClassName =
    'text-[10.5px] md:text-[11px] text-muted-foreground tracking-[1px] md:tracking-[1.5px] font-medium md:font-semibold block mb-[6px] md:mb-[8px] uppercase font-sans';
  const errorClassName = 'text-destructive text-[12px] mt-[6px] block font-sans';

  return (
    <AuthPageLayout
      title="Crie sua conta"
      description="Cadastre-se como cliente para reservar seus ingressos"
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-[14px] md:space-y-[18px]">
        <div>
          <label htmlFor="signup-email" className={labelClassName}>
            E-mail
          </label>
          <Input
            id="signup-email"
            type="email"
            autoComplete="email"
            placeholder="voce@email.com"
            {...register('email')}
            aria-invalid={!!errors.email}
            aria-describedby={errors.email ? 'signup-email-error' : undefined}
            aria-required="true"
            className={fieldClassName}
          />
          {errors.email?.message && (
            <span id="signup-email-error" role="alert" className={errorClassName}>
              {errors.email.message}
            </span>
          )}
        </div>

        <div>
          <label htmlFor="signup-password" className={labelClassName}>
            Senha
          </label>
          <div className="relative">
            <Input
              id="signup-password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder="Mínimo de 8 caracteres"
              {...register('password')}
              aria-invalid={!!errors.password}
              aria-describedby={errors.password ? 'signup-password-error' : undefined}
              aria-required="true"
              className={`${fieldClassName} pr-[40px]`}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-[12px] top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
              aria-label={showPassword ? 'Ocultar senhas' : 'Mostrar senhas'}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          {errors.password?.message && (
            <span id="signup-password-error" role="alert" className={errorClassName}>
              {errors.password.message}
            </span>
          )}
        </div>

        <div>
          <label htmlFor="signup-password-confirmation" className={labelClassName}>
            Confirme a senha
          </label>
          <div className="relative">
            <Input
              id="signup-password-confirmation"
              type={showPasswordConfirmation ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder="Repita sua senha"
              {...register('passwordConfirmation')}
              aria-invalid={!!errors.passwordConfirmation}
              aria-describedby={
                errors.passwordConfirmation ? 'signup-password-confirmation-error' : undefined
              }
              aria-required="true"
              className={`${fieldClassName} pr-[40px]`}
            />
            <button
              type="button"
              onClick={() => setShowPasswordConfirmation(!showPasswordConfirmation)}
              className="absolute right-[12px] top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
              aria-label={
                showPasswordConfirmation
                  ? 'Ocultar confirmação de senha'
                  : 'Mostrar confirmação de senha'
              }
            >
              {showPasswordConfirmation ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          {errors.passwordConfirmation?.message && (
            <span id="signup-password-confirmation-error" role="alert" className={errorClassName}>
              {errors.passwordConfirmation.message}
            </span>
          )}
        </div>

        {signupErrorMessage && (
          <div role="alert" className="text-destructive text-[13px] font-sans">
            {signupErrorMessage}
          </div>
        )}

        <Button
          type="submit"
          disabled={isSigningUp || !isValid}
          className="w-full bg-primary text-primary-foreground hover:bg-primary/90 h-auto text-[14.5px] md:text-[15px] font-semibold p-[12px] rounded-[4px] font-sans transition-colors mt-[8px]"
        >
          {isSigningUp ? 'Criando conta...' : 'Criar conta'}
        </Button>
      </form>

      <p className="text-[13px] text-muted-foreground text-center mt-[18px] mb-0">
        Já tem uma conta?{' '}
        <Link to="/login" className="font-semibold text-primary hover:underline">
          Entre
        </Link>
      </p>
    </AuthPageLayout>
  );
}
