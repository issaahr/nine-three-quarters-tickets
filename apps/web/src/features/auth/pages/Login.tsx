import { zodResolver } from '@hookform/resolvers/zod';
import axios from 'axios';
import { Eye, EyeOff } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { environment } from '../../../config/environment';
import { isApiRateLimitError, rateLimitErrorMessage } from '../../../lib/api';
import { getRoleNavigation } from '../../navigation/roleNavigation';
import { AuthPageLayout } from '../components/AuthPageLayout';
import { useAuth } from '../hooks';
import { LoginFormValues, loginSchema } from '../schemas';

interface LoginProps {
  publicSignupEnabled: boolean;
}

// As credenciais são públicas e existem exclusivamente para agilizar a avaliação da demonstração.
const demoUsers = {
  organizer: {
    email: 'organizer.demo@ntq.local',
    password: environment.demoUsersPassword,
  },
  customer: {
    email: 'customer.one.demo@ntq.local',
    password: environment.demoUsersPassword,
  },
  gate: { email: 'gate.demo@ntq.local', password: environment.demoUsersPassword },
} as const;

/** Traduz a falha de login sem revelar se o e-mail informado possui cadastro. */
function getLoginErrorMessage(error: unknown): string | null {
  if (!error) {
    return null;
  }

  if (axios.isAxiosError(error) && error.response?.status === 401) {
    return 'E-mail ou senha inválidos.';
  }

  if (isApiRateLimitError(error)) {
    return rateLimitErrorMessage;
  }

  return 'Não foi possível entrar. Tente novamente em instantes.';
}

export function Login({ publicSignupEnabled }: LoginProps) {
  const { user, login, isLoggingIn, loginError, isAuthenticated } = useAuth({
    restoreSession: false,
  });
  const navigate = useNavigate();
  const location = useLocation();
  const [showPassword, setShowPassword] = useState(false);
  const signupCompletedNavigation = Boolean(
    location.state &&
    typeof location.state === 'object' &&
    'signupCompleted' in location.state &&
    location.state.signupCompleted,
  );
  const [signupCompleted] = useState(() => signupCompletedNavigation);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isValid },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    mode: 'onChange',
  });

  useEffect(() => {
    if (isAuthenticated && user) {
      navigate(getRoleNavigation(user.role).homePath);
    }
  }, [isAuthenticated, navigate, user]);

  // Consome o flash de cadastro para que ele não reapareça após recarregar a página.
  useEffect(() => {
    if (signupCompletedNavigation) {
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location.pathname, navigate, signupCompletedNavigation]);

  const onSubmit = async (data: LoginFormValues) => {
    try {
      const authenticatedUser = await login(data);
      navigate(getRoleNavigation(authenticatedUser.role).homePath);
    } catch {
      // A mensagem correspondente é obtida do estado da mutation.
    }
  };

  const handleQuickAccess = (role: keyof typeof demoUsers) => {
    setValue('email', demoUsers[role].email, { shouldValidate: true });
    setValue('password', demoUsers[role].password, { shouldValidate: true });
  };

  const loginErrorMessage = getLoginErrorMessage(loginError);
  const quickAccess = (
    <div className="mt-[24px] md:mt-0">
      <div className="flex items-center gap-[12px] mb-[16px] md:my-6">
        <div className="flex-1 h-[0.5px] md:h-[1px] bg-secondary-foreground md:bg-border" />
        <span className="text-[9.5px] md:text-[10px] font-medium text-secondary md:text-muted-foreground tracking-[1.5px] whitespace-nowrap">
          ACESSO RÁPIDO PARA TESTE
        </span>
        <div className="flex-1 h-[0.5px] md:h-[1px] bg-secondary-foreground md:bg-border" />
      </div>

      <div className="flex gap-[8px]">
        {(
          [
            ['organizer', 'Organizador'],
            ['customer', 'Cliente'],
            ['gate', 'Portaria'],
          ] as const
        ).map(([role, label]) => (
          <Button
            key={role}
            type="button"
            onClick={() => handleQuickAccess(role)}
            variant="outline"
            className="flex-1 border-secondary md:border-border text-primary-foreground md:text-primary bg-transparent hover:bg-secondary-foreground md:hover:bg-muted h-auto py-[10px] md:py-[8px] px-[6px] md:px-0 text-[12px] font-medium font-sans rounded-[4px] transition-colors"
          >
            {label}
          </Button>
        ))}
      </div>
    </div>
  );

  return (
    <AuthPageLayout
      title="Bem-vindo de volta"
      description="Entre para comprar ou gerenciar seus ingressos"
      footer={quickAccess}
    >
      {signupCompleted && (
        <div role="status" className="text-[13px] text-foreground mb-[16px] font-sans">
          Conta criada. Entre com suas novas credenciais.
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-[16px] md:space-y-[20px]">
        <div>
          <label
            htmlFor="email"
            className="text-[10.5px] md:text-[11px] text-muted-foreground tracking-[1px] md:tracking-[1.5px] font-medium md:font-semibold block mb-[6px] md:mb-[8px] uppercase font-sans"
          >
            E-mail
          </label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="voce@email.com"
            {...register('email')}
            aria-invalid={!!errors.email}
            aria-describedby={errors.email ? 'email-error' : undefined}
            aria-required="true"
            className="w-full bg-background rounded-[4px] px-[14px] py-[12px] h-auto font-sans text-[14px] text-foreground border-border"
          />
          {errors.email?.message && (
            <span
              id="email-error"
              role="alert"
              className="text-destructive text-[12px] mt-[6px] block font-sans"
            >
              {errors.email.message}
            </span>
          )}
        </div>

        <div>
          <label
            htmlFor="password"
            className="text-[10.5px] md:text-[11px] text-muted-foreground tracking-[1px] md:tracking-[1.5px] font-medium md:font-semibold block mb-[6px] md:mb-[8px] uppercase font-sans"
          >
            Senha
          </label>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              placeholder="••••••••"
              {...register('password')}
              aria-invalid={!!errors.password}
              aria-describedby={errors.password ? 'password-error' : undefined}
              aria-required="true"
              className="w-full bg-background rounded-[4px] pl-[14px] pr-[40px] py-[12px] h-auto font-sans text-[14px] text-foreground border-border"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-[12px] top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
              aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          {errors.password?.message && (
            <span
              id="password-error"
              role="alert"
              className="text-destructive text-[12px] mt-[6px] block font-sans"
            >
              {errors.password.message}
            </span>
          )}
        </div>

        {loginErrorMessage && (
          <div role="alert" className="text-destructive text-[13px] font-sans">
            {loginErrorMessage}
          </div>
        )}

        <Button
          type="submit"
          disabled={isLoggingIn || !isValid}
          className="w-full bg-primary text-primary-foreground hover:bg-primary/90 h-auto text-[14.5px] md:text-[15px] font-semibold p-[12px] rounded-[4px] font-sans transition-colors mt-[8px] md:mt-2"
        >
          {isLoggingIn ? 'Aguarde...' : 'Entrar'}
        </Button>
      </form>

      {publicSignupEnabled && (
        <p className="text-[13px] text-muted-foreground text-center mt-[18px] mb-0">
          Ainda não tem conta?{' '}
          <Link to="/signup" className="font-semibold text-primary hover:underline">
            Cadastre-se
          </Link>
        </p>
      )}
    </AuthPageLayout>
  );
}
