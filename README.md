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
