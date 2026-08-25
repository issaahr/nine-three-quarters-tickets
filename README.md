<p align="center">
  <img src="docs/readme-banner.png" alt="9¾ Tickets" width="800" />
</p>

# 9¾ Tickets

![React](https://img.shields.io/badge/React-19-149ECA?logo=react&logoColor=white)
![NestJS](https://img.shields.io/badge/NestJS-11-E0234E?logo=nestjs&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white)
![TypeORM](https://img.shields.io/badge/TypeORM-0.3-E83524?logo=typeorm&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white)

Código fonte da plataforma 9¾ Tickets: uma plataforma de eventos e ingressos com reserva de assentos, pagamento simulado, ingresso com QR e validação na portaria.

## Aplicação publicada

|                               |                                                                     |
| ----------------------------- | ------------------------------------------------------------------- |
| Web                           | https://nine-three-quarters-tickets.vercel.app/                     |
| API                           | https://nine-three-quarters-tickets-1bf4ca494ed2.herokuapp.com/     |
| Documentação da API (Swagger) | https://nine-three-quarters-tickets-1bf4ca494ed2.herokuapp.com/docs |

O front está na Vercel e a API no Heroku, hospedados em provedores diferentes por conveniência de créditos e integração — os dois se comunicam normalmente via `CORS_ORIGINS`/`VITE_API_URL`, sem acoplamento entre plataformas.

## Resumo técnico

PostgreSQL é a autoridade de todo estado transacional: reservas, pagamentos, check-in e cancelamentos usam locks pessimistas e escrita condicional no banco, nunca lock em memória da aplicação. Pagamentos são simulados (sem gateway real). Detalhes de arquitetura, decisões e trade-offs estão documentados no [escopo técnico](docs/application-scope.md), nas [decisões técnicas](docs/technical-decisions.md) e nos [ADRs](docs/adr/).

## Documentação

- [Escopo do produto](docs/product-scope.md)
- [Escopo técnico e invariantes](docs/application-scope.md)
- [Arquitetura](docs/architecture.md)
- [Decisões técnicas](docs/technical-decisions.md)
- [Registros de decisões arquiteturais](docs/adr/)
- [Identidade visual](docs/ui-desicions.md)

## Pré-requisitos

- Node.js 22.12 ou mais recente
- npm 10 ou mais recente

## Instalação

```bash
npm --prefix apps/api install
npm --prefix apps/web install
```

API e web são projetos independentes. Cada aplicação possui seu próprio `package.json`, `package-lock.json`, dependências e toolchain.

Crie `.env` no root a partir de `.env.example` antes de iniciar as aplicações. API e web falham na inicialização quando uma variável obrigatória não está definida.

Além do banco e dos usuários de demonstração, configure:

- `NODE_ENV`: ambiente de execução (`development`, `test` ou `production`);
- `JWT_SECRET`: segredo de assinatura do JWT, com pelo menos 32 bytes;
- `JWT_EXPIRES_IN_SECONDS`: duração do token em segundos;
- `RESERVATION_HOLD_DURATION_SECONDS`: duração de um hold de assentos em segundos;
- `PAYMENT_CARD_PENDING_TIMEOUT_SECONDS`: limite em segundos para recuperar uma tentativa de cartão pendente após falha técnica;
- `CORS_ORIGINS`: origens permitidas, separadas por vírgula.
- `PUBLIC_SIGNUP_ENABLED`: habilita (`true`) ou desabilita (`false`) o cadastro público;
- `TRUST_PROXY_HOPS`: quantidade exata de proxies confiáveis antes da API (`0` em execução direta e `1` no Heroku);
- `RATE_LIMIT_AUTH_WINDOW_SECONDS` e `RATE_LIMIT_AUTH_MAX_REQUESTS`: janela e limite compartilhados por IP para login e signup;
- `RATE_LIMIT_CATALOG_WINDOW_SECONDS` e `RATE_LIMIT_CATALOG_MAX_REQUESTS`: janela e limite compartilhados por usuário para catálogo e criação de Events;
- `RATE_LIMIT_CHECK_IN_WINDOW_SECONDS` e `RATE_LIMIT_CHECK_IN_MAX_REQUESTS`: janela e limite por operador e IP para check-in manual;
- `TMDB_API_READ_ACCESS_TOKEN`: token Bearer mantido exclusivamente no backend;
- `TMDB_LANGUAGE`: idioma regional das respostas da TMDb, como `pt-BR`;
- `TMDB_REQUEST_TIMEOUT_MS`: limite em milissegundos para cada chamada externa;
- `TMDB_POSTER_SIZE`: tamanho de poster exigido da configuração da TMDb, como `w500`;
- `TICKETMASTER_API_KEY`: chave da Discovery API mantida exclusivamente no backend;
- `TICKETMASTER_LOCALE`: locale regional das respostas da Ticketmaster, como `pt-BR`;
- `TICKETMASTER_REQUEST_TIMEOUT_MS`: limite em milissegundos para cada chamada à Ticketmaster;
- `VITE_API_URL`: endereço público pelo qual o navegador acessa a API;
- `VITE_DEMO_USERS_PASSWORD`: senha pública preenchida pelos atalhos de demonstração.

Variáveis com prefixo `VITE_` são incorporadas ao bundle e podem ser inspecionadas no navegador. Nunca utilize esse prefixo em segredos. `VITE_DEMO_USERS_PASSWORD` é intencionalmente pública e deve ser usada somente nas contas demonstrativas. A configuração do Vite também expõe exclusivamente `PUBLIC_SIGNUP_ENABLED`, que não contém informação sensível e controla apenas a apresentação do fluxo; a API continua sendo a autoridade da flag.

## Credenciais externas

A aplicação consome duas APIs externas de catálogo — TMDb (filmes) e Ticketmaster Discovery (shows). As duas são opcionais para rodar a aplicação (a API falha apenas as chamadas de catálogo sem elas), mas são necessárias para publicar eventos como organizador.

**TMDb**

1. Crie uma conta em https://www.themoviedb.org/ e acesse as configurações de API em https://www.themoviedb.org/settings/api.
2. Solicite acesso à API (gratuito) e copie o **API Read Access Token** (token Bearer, não a "API Key" v3 clássica).
3. Defina no `.env`: `TMDB_API_READ_ACCESS_TOKEN`.

**Ticketmaster**

1. Crie uma conta em https://developer.ticketmaster.com/ e registre um app no painel de desenvolvedor.
2. Copie a **Consumer Key** gerada para o app — é a chave usada pela Discovery API.
3. Defina no `.env`: `TICKETMASTER_API_KEY`.

**Validar a configuração**

Com a API rodando, chame um endpoint de catálogo autenticado como `ORGANIZER` (via Swagger em `/docs`, ou `curl`):

```bash
curl -H "Cookie: accessToken=<token da sessão>" "http://localhost:3000/catalog/movies/popular?page=1"
curl -H "Cookie: accessToken=<token da sessão>" "http://localhost:3000/catalog/attractions/popular?page=1"
```

Uma resposta `200` com itens reais confirma que a chave está válida. `401`/`403` indicam sessão ausente; erro vindo do provedor externo (timeout ou payload de erro da TMDb/Ticketmaster) indica chave ausente ou inválida.

Nenhuma das duas chaves usa prefixo `VITE_`, não são enviadas ao navegador e não devem ser versionadas.

## Scripts das aplicações

```bash
npm --prefix apps/web run dev
npm --prefix apps/api run dev
```

Cada aplicação possui seus próprios scripts `dev`, `build`, `start`, `lint`, `format` e `format:check`, além das próprias dependências e configurações de TypeScript e ESLint.

Não existe um script para subir web e API juntos. Essa coordenação pertence ao Docker Compose.

## Docker Compose

O fluxo Docker completo (web + API + PostgreSQL, com hot reload via bind mounts) é suportado em Linux e WSL2. No WSL2, mantenha o repositório no filesystem Linux, por exemplo em `/home/<usuario>/projetos`, e não em `/mnt/c`, para que os eventos nativos de filesystem sejam propagados corretamente aos containers.

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

**Só o banco:** se preferir rodar API e web localmente com `npm` (fora do Docker) e usar o container apenas para o PostgreSQL:

```bash
docker compose up postgres
```

Isso sobe só o banco em `localhost:5432`; use os scripts `npm --prefix apps/api run dev` e `npm --prefix apps/web run dev` normalmente, apontando `DATABASE_URL` para esse Postgres local.

**Windows sem WSL2:** o hot reload via bind mount do Docker Compose não é validado nesse ambiente. O fluxo direto — rodar `npm --prefix apps/api run dev` e `npm --prefix apps/web run dev` nativamente no Windows, com `docker compose up postgres` só para o banco — funciona normalmente, já que Node.js roda nativamente em Windows sem depender do Docker.

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

Crie uma nova migration para cada mudança de schema. Não utilize `synchronize` como substituto para migrations. Migrations não sofrem rollback automático em produção — ver [Integração contínua](#integração-contínua) para o comportamento completo do deploy.

## Usuários de demonstração

A migration de seed cria automaticamente quatro usuários quando é aplicada pela primeira vez:

| Email                         | Role        |
| ----------------------------- | ----------- |
| `organizer.demo@ntq.local`    | `ORGANIZER` |
| `customer.one.demo@ntq.local` | `CUSTOMER`  |
| `customer.two.demo@ntq.local` | `CUSTOMER`  |
| `gate.demo@ntq.local`         | `GATE`      |

Todos utilizam a senha definida em `DEMO_USERS_PASSWORD`. Essas contas são destinadas exclusivamente à demonstração; defina a variável no `.env` antes de iniciar um banco novo e não reutilize essa senha em contas reais.

Para que os atalhos da tela de login preencham a mesma credencial, defina `VITE_DEMO_USERS_PASSWORD` com o mesmo valor. Essa segunda variável é pública por fazer parte do bundle do frontend; ela não deve ser reutilizada fora do ambiente demonstrativo.

Eventos publicados de exemplo (filmes e shows, incluindo casos cancelados) são criados por um script de seed separado das migrations, executado uma vez com o organizador demo já existente:

```bash
docker compose exec api npm run seed:events
```

Ele é idempotente — reexecutar não duplica eventos já criados (identificados por fonte de catálogo + ID externo) — e é bloqueado automaticamente se `NODE_ENV=production`.

## Autenticação

O login está disponível em `POST /auth/login`. Em caso de sucesso, a resposta contém somente os dados públicos do usuário e o JWT é enviado no cookie `accessToken`, inacessível a JavaScript por ser `HttpOnly`.

O frontend pode restaurar a identidade autenticada por `GET /auth/session`. Uma sessão válida retorna `200` com somente `id` e `role`; cookie ausente ou inválido retorna `204`, pois a ausência de sessão é um resultado esperado dessa consulta. O token continua inacessível ao JavaScript. `POST /auth/logout` encerra a sessão expirando o cookie e pode ser chamado mesmo quando ele já estiver ausente ou inválido.

Em desenvolvimento e testes, o cookie utiliza `SameSite=Lax` sem `Secure` para funcionar em HTTP local. Em produção, utiliza `SameSite=None` e `Secure` para permitir que web e API estejam em sites diferentes. O cliente deve enviar requisições com credenciais e a origem precisa estar declarada em `CORS_ORIGINS`.

Quando `PUBLIC_SIGNUP_ENABLED=true`, `POST /auth/signup` cria exclusivamente uma conta `CUSTOMER` e a tela de login oferece acesso ao formulário público. O cadastro não inicia sessão automaticamente. Alterar a flag exige reiniciar a API e reconstruir ou reiniciar o frontend; com `false`, o frontend remove o fluxo e a API responde que o endpoint está indisponível. Essa flag visa proteger contra possíveis abusos contra a API, visto que o fluxo de cadastro é simples para facilitar caso o avaliador precise.

A senha de uma nova conta deve possuir ao menos 8 caracteres e no máximo 72 bytes em UTF-8, limite aplicado antes do hash bcrypt. E-mails duplicados são rejeitados pela constraint do PostgreSQL.

A documentação Swagger da API fica disponível em `http://localhost:3000/docs`.

## Testes da API

```bash
npm --prefix apps/api test
npm --prefix apps/api run test:typecheck
```

Os testes end-to-end dependem do PostgreSQL e podem ser executados com a stack Docker ativa:

```bash
docker compose exec api npm run test:e2e
```

## Testes do frontend

Os testes de autenticação exercitam o roteamento, o cache do TanStack Query e os contratos HTTP simulados com MSW:

```bash
npm --prefix apps/web test
```

## Integração contínua

**CI** — o GitHub Actions valida web, API com PostgreSQL e os builds production dos containers em pull requests para `main` e pushes na branch. Os jobs respeitam os lockfiles independentes de cada aplicação, utilizam configuração determinística exclusiva para testes definida no workflow e não publicam imagens.

**CD** — após o CI passar num push em `main`, a API é publicada automaticamente no Heroku via Container Registry. O pipeline:

1. Constrói e publica a imagem da API;
2. Registra a versão da release anterior (necessária para rollback);
3. Faz o release da nova imagem;
4. Chama `GET /health` repetidamente por um período configurado, aguardando resposta saudável;
5. Se a nova versão não ficar saudável a tempo, executa `heroku rollback` de volta à release anterior e marca o deploy como falho.

O rollback reverte apenas a release da aplicação (a imagem), não o schema do banco: **migrations executam na inicialização e não sofrem rollback automático**. Por isso, toda migration publicada precisa permanecer compatível com a release anterior até que seja seguro removê-la — um rollback de release nunca deve depender de uma migration também ser desfeita.

O deploy do frontend na Vercel é feito pela integração nativa da Vercel com o repositório (fora do GitHub Actions).

## Limitações conhecidas

- **Cancelamento em massa de evento**: o cancelamento de um Event pelo organizador processa todas as suas reservas numa única transação (tudo ou nada). Com volume muito alto de reservas simultâneas, essa transação pode ficar longa;
- **Atraso na liberação visual de assento após expiração de hold**: a liberação de um assento cujo hold expirou é refletida no mapa em tempo real via reconciliação passiva (polling de 15s), não por evento imediato — decisão documentada na [seção 50 do escopo técnico](docs/application-scope.md). O assento já está disponível para reserva antes disso; é só a exibição que pode levar até 15s para atualizar em telas de outros usuários já abertas.
- **Cookies HttpOnly em contextos que bloqueiam cookies de terceiros**: navegadores com bloqueio agressivo de cookies cross-site podem impedir a sessão de persistir quando web e API estão em domínios diferentes (como na aplicação publicada).
- **Sem cadastro ou edição de Locais** pela interface — Locais são semeados via migration.
- **Rate limiting não é distribuído**: a proteção contra força bruta e abuso (login, catálogo, check-in manual) funciona por instância; não há coordenação entre múltiplas instâncias da API.
- **PIX, webhook e integração financeira real** não fazem parte da V1 — o pagamento é integralmente simulado (`FakePaymentGateway`), sem transação financeira real. Ver [decisões técnicas](docs/technical-decisions.md) para o desenho de evolução futura.
- **Sem edição de dados do usuário** (perfil, e-mail, senha) na V1.

## Estrutura

```text
apps/
├── api/  # NestJS + TypeScript
└── web/  # React + Vite + TypeScript
```

Cada aplicação mantém suas dependências e configurações de TypeScript, ESLint e Prettier. Pacotes compartilhados e módulos de negócio serão criados somente quando um requisito concreto justificar isso.

## Padrões de desenvolvimento

Cada workspace valida suas próprias mudanças com `lint`, `format:check` e `build`; não versione `.env`, credenciais, builds ou dependências instaladas. A independência entre API e web (sem package compartilhado no root) é uma decisão registrada no [ADR 0002](docs/adr/0002-dependencias-independentes-no-monorepo.md).

## Credits

<table>
  <tr>
    <td width="60">
      <img
        src="https://www.themoviedb.org/assets/v4/logos/v2/blue_square_1-5bdc75aaebeb75dc7ae79426ddd9be3b2be1e342510f8202baf6bffa71d7f5c4.svg"
        alt="TMDB logo"
        width="40"
      />
    </td>
    <td>
      This website uses TMDB and the TMDB APIs but is not endorsed, certified, or otherwise approved by TMDB.
    </td>
  </tr>
  <tr>
    <td width="60">
      <img
        src="https://s3.eu-west-1.amazonaws.com/prd273.tm-intl-pci.mfol.prod1.eu-west-1.tmaws-static-pages/media/tmeu/poland/help/logo_guide/assets/Ticketmaster-Logo-Azure-RGB.png"
        alt="Ticketmaster logo"
        width="40"
      />
    </td>
    <td>
      Dados de eventos fornecidos pela Ticketmaster Discovery API.
    </td>
  </tr>
</table>

## Converse com a documentação

Ferramenta exploratória opcional, sem status de fonte oficial — a documentação em [`docs/`](docs/) continua sendo a referência canônica.

[Abrir no NotebookLM](https://notebook.google.com/notebook/e9c72c21-e088-4e56-8065-6997f156fcbc)

Grounding restrito exclusivamente aos arquivos de `docs/` e a este README, sem conhecimento externo. Perguntas de partida sugeridas:

- Como o sistema garante que o mesmo assento nunca é vendido duas vezes?
- Como funciona a credencial do ingresso e por que ela não pode ser forjada?
- O que acontece se o pagamento falhar depois que o hold do assento já expirou?
- Por que a portaria opera vinculada a um evento por sessão, e não globalmente?
