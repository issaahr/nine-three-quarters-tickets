# 9¾ Tickets

Monorepo da plataforma 9¾ Tickets.

## Pré-requisitos

- Node.js 22.12 ou mais recente
- npm 10 ou mais recente

## Instalação

```bash
npm --prefix apps/api install
npm --prefix apps/web install
```

API e web são projetos independentes. Cada aplicação possui seu próprio `package.json`, `package-lock.json`, dependências e toolchain.

Crie `.env` no root a partir de `.env.example` antes de iniciar a API. A aplicação falha na inicialização quando uma variável obrigatória não está definida.

## Scripts das aplicações

```bash
npm --prefix apps/web run dev
npm --prefix apps/api run dev
```

Cada aplicação possui seus próprios scripts `dev`, `build`, `start`, `lint`, `format` e `format:check`, além das próprias dependências e configurações de TypeScript e ESLint.

Não existe um script para subir web e API juntos. Essa coordenação pertence ao Docker Compose.

## Docker Compose

O fluxo Docker com hot reload é suportado em Linux e WSL2. No WSL2, mantenha o repositório no filesystem Linux, por exemplo em `/home/<usuario>/projetos`, e não em `/mnt/c`, para que os eventos nativos de filesystem sejam propagados corretamente aos containers.

Crie o arquivo de ambiente local antes de subir a stack:

```bash
cp .env.example .env
```

No PowerShell:

```powershell
Copy-Item .env.example .env
```

Inicie web, API e PostgreSQL:

```bash
docker compose up --build
```

A stack de desenvolvimento utiliza bind mounts e mantém hot reload ativo. Os serviços ficam disponíveis em:

- web: `http://localhost:5173`;
- API: `http://localhost:3000`;
- PostgreSQL: `localhost:5432`.

Encerre a stack com `docker compose down`. Para remover também os dados locais do PostgreSQL, use explicitamente `docker compose down --volumes`.

## Banco de dados e migrations

A API utiliza TypeORM com PostgreSQL. `DATABASE_URL` é obrigatória, `synchronize` permanece desabilitado e migrations pendentes são executadas automaticamente quando a API inicia.

Com a stack Docker em execução, execute os comandos a partir do root do repositório:

```bash
# Criar uma migration vazia
docker compose exec api npm run migration:create -- src/database/migrations/NomeDaMigration

# Gerar uma migration a partir das entities
docker compose exec api npm run migration:generate -- src/database/migrations/NomeDaMigration

# Executar, listar ou reverter migrations manualmente
docker compose exec api npm run migration:run
docker compose exec api npm run migration:show
docker compose exec api npm run migration:revert
```

Crie uma nova migration para cada mudança de schema. Não utilize `synchronize` como substituto para migrations.

## Usuários de demonstração

A migration de seed cria automaticamente quatro usuários quando é aplicada pela primeira vez:

| Email | Role |
| --- | --- |
| `organizer.demo@ntq.local` | `ORGANIZER` |
| `customer.one.demo@ntq.local` | `CUSTOMER` |
| `customer.two.demo@ntq.local` | `CUSTOMER` |
| `gate.demo@ntq.local` | `GATE` |

Todos utilizam a senha definida em `DEMO_USERS_PASSWORD`. Essas contas são destinadas exclusivamente à demonstração; defina a variável no `.env` antes de iniciar um banco novo e não reutilize essa senha em contas reais.

## Estrutura

```text
apps/
├── api/  # NestJS + TypeScript
└── web/  # React + Vite + TypeScript
```

Cada aplicação mantém suas dependências e configurações de TypeScript, ESLint e Prettier. Pacotes compartilhados e módulos de negócio serão criados somente quando um requisito concreto justificar isso.

## Padrões de desenvolvimento

- mantenha código específico dentro do workspace proprietário;
- não crie packages compartilhados para antecipar reutilização;
- valide o workspace alterado executando seus próprios scripts `lint`, `format:check` e `build`;
- não versione arquivos `.env`, credenciais, builds ou dependências instaladas.
