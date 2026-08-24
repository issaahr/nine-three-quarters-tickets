interface RoleLandingProps {
  eyebrow: string;
  title: string;
  description: string;
  operational?: boolean;
}

/** Apresenta somente o contexto inicial do papel, sem antecipar módulos de negócio. */
export function RoleLanding({
  eyebrow,
  title,
  description,
  operational = false,
}: RoleLandingProps) {
  return (
    <main className="mx-auto flex min-h-[calc(100vh-68px)] max-w-7xl items-center px-6 py-12 lg:px-8">
      <section className="max-w-2xl">
        <p
          className={`mb-4 text-[11px] font-medium uppercase tracking-[2px] ${
            operational ? 'text-brass-dark' : 'text-primary'
          }`}
        >
          {eyebrow}
        </p>
        <h1
          className={`m-0 font-heading text-4xl font-semibold leading-tight sm:text-5xl ${
            operational ? 'text-background' : 'text-foreground'
          }`}
        >
          {title}
        </h1>
        <p
          className={`mt-5 max-w-xl text-[15px] leading-7 ${
            operational ? 'text-surface-dark-muted' : 'text-muted-foreground'
          }`}
        >
          {description}
        </p>
        <div
          className={`mt-9 border-l-2 py-1 pl-4 text-[12px] uppercase tracking-[1.2px] ${
            operational ? 'border-primary text-border' : 'border-secondary text-muted-foreground'
          }`}
        >
          Sessão autenticada
        </div>
      </section>
    </main>
  );
}
