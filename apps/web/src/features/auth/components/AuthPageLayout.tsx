import { ReactNode } from 'react';

interface AuthPageLayoutProps {
  title: string;
  description: string;
  children: ReactNode;
  footer?: ReactNode;
}

/** Compartilha apenas a moldura visual estável das páginas públicas de autenticação. */
export function AuthPageLayout({ title, description, children, footer }: AuthPageLayoutProps) {
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
            {Array.from({ length: 8 }, (_, index) => (
              <span
                key={index}
                className={`${index > 5 ? 'md:hidden ' : ''}w-[2.5px] md:w-[3px] h-[2.5px] md:h-[3px] rounded-full bg-secondary`}
              />
            ))}
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

      <div className="md:flex-none md:w-[540px] lg:w-[640px] xl:w-[720px] bg-transparent md:bg-background px-[24px] pb-[32px] md:py-[56px] md:px-[64px] flex flex-col justify-start md:justify-center items-center shrink-0">
        <div className="w-full max-w-[440px] md:max-w-[400px] mx-auto">
          <div className="bg-background md:bg-transparent px-[28px] md:px-0 pt-[32px] md:pt-0 pb-[28px] md:pb-0 [clip-path:polygon(0_0,100%_0,100%_calc(100%-20px),calc(100%-20px)_100%,0_100%)] md:[clip-path:none]">
            <h1 className="font-heading font-semibold md:font-bold text-[22px] md:text-[32px] text-foreground m-0 mb-[6px] md:mb-2">
              {title}
            </h1>
            <p className="text-[13px] md:text-[14px] text-muted-foreground m-0 mb-[20px] md:mb-6">
              {description}
            </p>
            {children}
          </div>
          {footer}
        </div>
      </div>
    </div>
  );
}
