import axios from 'axios';
import { Eye, EyeOff } from 'lucide-react';
import { useEffect, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';

import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { environment } from '../../../config/environment';
import { useAuth } from '../hooks';
import { LoginFormValues, loginSchema } from '../schemas';

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

  return 'Não foi possível entrar. Tente novamente em instantes.';
}

export function Login() {
  const { login, isLoggingIn, loginError, isAuthenticated } = useAuth({
    restoreSession: false,
  });
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);

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
    if (isAuthenticated) {
      navigate('/');
    }
  }, [isAuthenticated, navigate]);

  const onSubmit = async (data: LoginFormValues) => {
    try {
      await login(data);
      navigate('/');
    } catch {
      // A mensagem correspondente é obtida do estado da mutation.
    }
  };

  const handleQuickAccess = (role: keyof typeof demoUsers) => {
    setValue('email', demoUsers[role].email, { shouldValidate: true });
    setValue('password', demoUsers[role].password, { shouldValidate: true });
  };

  const loginErrorMessage = getLoginErrorMessage(loginError);

  return (
    <div className="flex flex-col md:flex-row min-h-screen font-sans bg-secondary-foreground md:bg-transparent justify-center md:justify-start">
      <div className="md:flex-1 bg-secondary-foreground pt-[32px] md:pt-[48px] px-[24px] pb-[24px] md:p-[64px] flex flex-col justify-start md:justify-center relative overflow-hidden md:min-h-[300px] shrink-0">
        <div className="md:absolute md:top-[48px] md:left-[64px] z-10 inline-flex flex-col items-center md:items-start w-fit gap-[4px] mx-auto md:mx-0">
          <div className="flex items-baseline gap-[10px] md:gap-2">
            <span className="font-heading font-semibold text-[32px] md:text-[24px] text-primary-foreground leading-none">
              9¾
            </span>
            <span className="font-medium text-[12px] md:text-[11px] tracking-[3px] md:tracking-[2px] text-primary-foreground">
              TICKETS
            </span>
          </div>
          <div className="flex gap-[5px] mt-[6px] md:mt-0" aria-hidden="true">
            <span className="w-[2.5px] md:w-[3px] h-[2.5px] md:h-[3px] rounded-full bg-secondary"></span>
            <span className="w-[2.5px] md:w-[3px] h-[2.5px] md:h-[3px] rounded-full bg-secondary"></span>
            <span className="w-[2.5px] md:w-[3px] h-[2.5px] md:h-[3px] rounded-full bg-secondary"></span>
            <span className="w-[2.5px] md:w-[3px] h-[2.5px] md:h-[3px] rounded-full bg-secondary"></span>
            <span className="w-[2.5px] md:w-[3px] h-[2.5px] md:h-[3px] rounded-full bg-secondary"></span>
            <span className="w-[2.5px] md:w-[3px] h-[2.5px] md:h-[3px] rounded-full bg-secondary"></span>
            <span className="w-[2.5px] h-[2.5px] rounded-full bg-secondary md:hidden"></span>
            <span className="w-[2.5px] h-[2.5px] rounded-full bg-secondary md:hidden"></span>
          </div>
        </div>

        <div className="hidden md:block relative z-10 w-full mt-12 md:mt-0">
          <p className="font-heading italic font-semibold text-[36px] md:text-[46px] text-background leading-[1.15] m-0 mb-[24px]">
            Seu próximo destino começa aqui
          </p>
          <p className="text-[14px] md:text-[15px] text-secondary max-w-[400px] leading-[1.6] m-0">
            Filmes e shows num único lugar de embarque. Entre para reservar seu lugar
          </p>
        </div>

        <span className="hidden md:block absolute -bottom-[20px] -right-[10px] md:bottom-[20px] md:right-[40px] font-heading font-bold italic text-[180px] md:text-[250px] text-primary-foreground leading-none select-none pointer-events-none z-0 opacity-5">
          9¾
        </span>
      </div>

      <div className="md:flex-none md:w-[540px] lg:w-[640px] xl:w-[720px] bg-transparent md:bg-background px-[24px] pb-[32px] md:py-[56px] md:px-[64px] flex flex-col justify-start md:justify-center items-center md:items-center shrink-0">
        <div className="w-full max-w-[440px] md:max-w-[400px] mx-auto">
          <div className="bg-background md:bg-transparent px-[28px] md:px-0 pt-[32px] md:pt-0 pb-[28px] md:pb-0 [clip-path:polygon(0_0,100%_0,100%_calc(100%-20px),calc(100%-20px)_100%,0_100%)] md:[clip-path:none]">
            <h1 className="font-heading font-semibold md:font-bold text-[22px] md:text-[32px] text-foreground m-0 mb-[6px] md:mb-2">
              Bem-vindo de volta
            </h1>
            <p className="text-[13px] md:text-[14px] text-muted-foreground m-0 mb-[20px] md:mb-6">
              Entre para comprar ou gerenciar seus ingressos
            </p>

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
          </div>

          <div className="mt-[24px] md:mt-0">
            <div className="flex items-center gap-[12px] mb-[16px] md:my-6">
              <div className="flex-1 h-[0.5px] md:h-[1px] bg-secondary-foreground md:bg-border"></div>
              <span className="text-[9.5px] md:text-[10px] font-medium text-secondary md:text-muted-foreground tracking-[1.5px] whitespace-nowrap">
                ACESSO RÁPIDO PARA TESTE
              </span>
              <div className="flex-1 h-[0.5px] md:h-[1px] bg-secondary-foreground md:bg-border"></div>
            </div>

            <div className="flex gap-[8px]">
              <Button
                type="button"
                onClick={() => handleQuickAccess('organizer')}
                variant="outline"
                className="flex-1 border-secondary md:border-border text-primary-foreground md:text-primary bg-transparent hover:bg-secondary-foreground md:hover:bg-muted h-auto py-[10px] md:py-[8px] px-[6px] md:px-0 text-[12px] font-medium font-sans rounded-[4px] transition-colors"
              >
                Organizador
              </Button>
              <Button
                type="button"
                onClick={() => handleQuickAccess('customer')}
                variant="outline"
                className="flex-1 border-secondary md:border-border text-primary-foreground md:text-primary bg-transparent hover:bg-secondary-foreground md:hover:bg-muted h-auto py-[10px] md:py-[8px] px-[6px] md:px-0 text-[12px] font-medium font-sans rounded-[4px] transition-colors"
              >
                Cliente
              </Button>
              <Button
                type="button"
                onClick={() => handleQuickAccess('gate')}
                variant="outline"
                className="flex-1 border-secondary md:border-border text-primary-foreground md:text-primary bg-transparent hover:bg-secondary-foreground md:hover:bg-muted h-auto py-[10px] md:py-[8px] px-[6px] md:px-0 text-[12px] font-medium font-sans rounded-[4px] transition-colors"
              >
                Portaria
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
