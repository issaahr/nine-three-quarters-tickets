# Arquitetura do 9¾ Tickets

## Visão geral

O 9¾ Tickets é um monorepo com duas aplicações independentes:

```text
apps/
├── api/  # NestJS, TypeORM e PostgreSQL
└── web/  # React, Vite e TanStack Query
```

A API é um monólito modular. O frontend é organizado por features e consome a API por HTTP. O Docker Compose coordena as aplicações e o PostgreSQL no desenvolvimento local.

```text
Browser
  │
  ▼
React/Vite ──HTTP + cookie HttpOnly──▶ NestJS ──TypeORM──▶ PostgreSQL
                                         │
                                         └──▶ provedores externos, quando implementados
```

PostgreSQL é a autoridade dos invariantes transacionais. Estado do frontend, timers do navegador e atualizações em tempo real nunca substituem uma decisão persistida pelo backend.

## Organização do repositório

API e web possuem seus próprios:

- `package.json`;
- `package-lock.json`;
- dependências;
- scripts;
- configurações de TypeScript, lint e testes.

O root não possui package compartilhado nem scripts para executar as duas aplicações em conjunto. Essa coordenação pertence ao Docker Compose. Um package compartilhado só será criado se uma necessidade concreta justificar o acoplamento.

Consulte o [ADR 0002](adr/0002-dependencias-independentes-no-monorepo.md) para o contexto dessa decisão.

## API

### Estrutura atual

```text
apps/api/src/
├── config/              # leitura e validação centralizada do ambiente
├── database/            # DataSource, entidade base e migrations
├── errors/              # contrato comum de erros controlados
└── modules/
    ├── auth/            # login, sessão, cadastro, JWT e autorização
    ├── catalog/         # port de catálogo e adapter da TMDb
    ├── events/          # ocorrência, publicação e inventário seated materializado
    ├── payments/        # tentativa idempotente e gateway de cartão simulado
    ├── reservations/    # holds temporários, itens, retomada e cancelamento
    ├── tickets/         # ingressos emitidos para ReservationItems confirmados
    ├── users/           # entidade User e enum de papéis
    └── venues/          # locais e layouts físicos reutilizáveis
```

Cada módulo de domínio deve manter próximos os seus contratos HTTP, entidades, regras e erros. Uma pasta de módulo não precisa conter controller, service ou repository próprios quando não existir comportamento que os justifique.

O acesso comum a dados utiliza diretamente `Repository<T>` do TypeORM. Classes de persistência específicas são reservadas a consultas semânticas, locking, escritas condicionais ou transações que acrescentem comportamento real.

### Colaboração entre módulos

Módulos internos podem colaborar diretamente quando a dependência é estável e clara. Interfaces e ports são priorizados nas fronteiras externas ou voláteis, como catálogos e pagamentos.

Não são adotados repository genérico, event bus interno, camada obrigatória de use cases ou interfaces que apenas renomeiem implementações concretas.

### Persistência

- TypeORM utiliza Data Mapper, sem Active Record.
- `synchronize` permanece desabilitado.
- Toda evolução de schema utiliza migration.
- Transações usam o `EntityManager` da própria transação.
- Restrições concorrentes pertencem prioritariamente ao PostgreSQL.

## Frontend

### Estrutura atual

```text
apps/web/src/
├── components/ui/       # componentes Shadcn mantidos como código local
├── config/              # configuração pública validada
├── features/
│   ├── auth/            # contratos, API, hooks e páginas de autenticação
│   ├── events/          # descoberta pública, filtros e apresentação de ocorrências
│   ├── navigation/      # shells e navegação por papel
│   ├── organizer/       # catálogo externo, criação, publicação e contratos do painel
│   ├── payments/        # formulário de cartão e estado de pagamento do checkout
│   └── reservations/    # cliente HTTP, estado remoto, checkout e countdown derivado
├── lib/                 # infraestrutura HTTP e utilitários pequenos
└── test/                # configuração e servidor MSW
```

Tipos compartilhados dentro de uma feature ficam em arquivos próprios quando possuem mais de um consumidor. Interfaces locais permanecem junto da implementação que descrevem. Barrels `index.ts` não são criados por padrão; imports diretos preservam a origem das dependências e reduzem ciclos acidentais.

### Sessão e roteamento

TanStack Query mantém a identidade da sessão recebida da API. O token não é acessível ao JavaScript.

O fluxo de navegação autenticada é:

```text
ProtectedRoute
  └── AuthenticatedLayout
      ├── RoleRoute CUSTOMER
      │   ├── /customer → /events
      │   └── /customer/reservations/:reservationId
      ├── RoleRoute ORGANIZER → /organizer
      ├── RoleRoute GATE → /gate
      └── RoleHomeRedirect → fallback conforme papel
```

`RoleRoute` impede navegação acidental para a área visual de outro papel. Essa proteção é somente UX; cada endpoint de negócio continua responsável por autenticação e autorização na API.

O catálogo em `/events` é público e restaura a sessão apenas para adaptar sua navegação, sem bloquear a descoberta anônima. CUSTOMER e ORGANIZER utilizam a superfície clara da identidade visual. GATE utiliza a superfície operacional escura documentada para a portaria, sem antecipar seleção de evento ou check-in.

O painel do organizador consulta exclusivamente `GET /organizer/me/events`; a identidade do proprietário vem da sessão e nunca de parâmetros controlados pelo frontend. O formulário oferece descoberta e pesquisa paginadas no catálogo, cria um DRAFT com o snapshot reconstruído pela API e publica a ocorrência em uma ação separada, permitindo recuperar o rascunho quando somente a publicação falha.

A descoberta pública consulta `GET /events` sem acessar novamente o catálogo externo. A API retorna somente ocorrências `PUBLISHED` e futuras, usando o snapshot persistido no Event e o Venue associado para busca, filtros e apresentação canônica. A leitura direta por `GET /events/:eventId` também admite ocorrências passadas e `CANCELLED`, mantém DRAFT indistinguível de um recurso inexistente e deriva `isPast` no PostgreSQL.

O fluxo SEATED mantém a seleção inicial em estado local. Somente uma criação bem-sucedida de `Reservation` abre o checkout protegido. TanStack Query mantém Reservation ativa, detalhe e mapa no estado remoto; criação e cancelamento invalidam o mapa. O countdown é derivado de `expiresAt` para apresentação, enquanto a API e os timestamps do PostgreSQL permanecem autoritativos para validade e inventário.

## Fronteiras externas e futuras

- A TMDb implementa a port `CatalogProvider`; sua resposta é normalizada antes de alcançar Events e nunca fornece inventário ou dados locais de venda.
- Ticketmaster implementará a mesma fronteira quando o fluxo de shows entrar no escopo de implementação.
- O gateway de pagamento é uma fronteira substituível; a V1 utiliza `FakePaymentGateway`.
- Socket.IO atualizará percepção de disponibilidade, sem autoridade transacional.
- Módulos futuros devem seguir as entidades e invariantes de `application-scope.md`, sem introduzir abstrações genéricas de inventário.

Essas fronteiras registram direção arquitetural, não autorizam implementação antes da respectiva issue.
