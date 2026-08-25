<p align="center">
  <img src="docs/readme-banner.png" alt="9¾ Tickets" width="800" />
</p>

# 9¾ Tickets

<p align="center">
  <img src="https://img.shields.io/badge/React-19-149ECA?logo=react&logoColor=white" alt="React 19" />
  <img src="https://img.shields.io/badge/NestJS-11-E0234E?logo=nestjs&logoColor=white" alt="NestJS 11" />
  <img src="https://img.shields.io/badge/PostgreSQL-17-4169E1?logo=postgresql&logoColor=white" alt="PostgreSQL 17" />
  <img src="https://img.shields.io/badge/TypeORM-0.3-E83524?logo=typeorm&logoColor=white" alt="TypeORM 0.3" />
  <img src="https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white" alt="Docker Compose" />
</p>

Plataforma full-stack de eventos e ingressos com descoberta de filmes e shows, reserva de assentos, entrada geral, checkout com pagamento simulado, emissão de Tickets com QR Code e validação na portaria.

## Aplicação publicada

|                                   |                                                                     |
| --------------------------------- | ------------------------------------------------------------------- |
| **Web**                           | https://nine-three-quarters-tickets.vercel.app/                     |
| **API**                           | https://nine-three-quarters-tickets-1bf4ca494ed2.herokuapp.com/     |
| **Documentação da API (Swagger)** | https://nine-three-quarters-tickets-1bf4ca494ed2.herokuapp.com/docs |

O frontend está hospedado na Vercel e a API no Heroku, permitindo deploy independente das aplicações.

## Funcionalidades

### CUSTOMER

* descoberta de filmes e shows;
* busca, filtros e ordenação de eventos;
* eventos com assentos numerados;
* eventos com entrada geral;
* reserva temporária de inventário;
* checkout com pagamento simulado;
* emissão de Tickets individuais;
* QR Code e credencial protegida contra adulteração;
* consulta e cancelamento de compras;
* visualização dos Tickets.

### ORGANIZER

* criação e publicação de Events;
* configuração de inventário, capacidade e preços;
* busca, filtros e ordenação dos próprios Events;
* paginação server-side;
* acompanhamento de inventário;
* métricas agregadas de vendas e receita.

### GATE

* operação vinculada a um Event;
* leitura de QR Code;
* validação manual por código;
* confirmação de ingresso pertencente ao evento em operação;
* controle de utilização do Ticket.

### Integrações externas

* TMDb para descoberta de filmes;
* Ticketmaster Discovery API para descoberta de shows.

## Principais decisões técnicas

### PostgreSQL como autoridade transacional

O PostgreSQL é a autoridade de todo estado transacional do sistema. Reservas, inventário, pagamentos, check-in e cancelamentos não dependem de estado ou locks mantidos em memória da aplicação.

Operações críticas de concorrência utilizam transações, locks pessimistas e/ou escrita condicional no banco conforme a invariante protegida.

O frontend pode apresentar estados derivados para melhorar a experiência, mas nunca é a autoridade sobre disponibilidade, validade de Reservation ou estado de Ticket. Essas condições são sempre revalidadas pela API e pelo banco.

### Concorrência e inventário

A aquisição de assentos é protegida no PostgreSQL para impedir que duas operações concorrentes confirmem o mesmo inventário. Holds possuem expiração baseada no horário do banco, e a aplicação não depende de timers do navegador para garantir a correção transacional.

### Monólito modular

O backend é um monólito modular organizado por domínio. API e web são aplicações independentes dentro do mesmo repositório, cada uma com seu próprio `package.json`, lockfile, dependências e toolchain.

Não existe um `package.json` compartilhado nem um workspace de package manager entre as aplicações. Essa independência foi mantida deliberadamente para evitar acoplamento desnecessário entre os ciclos de desenvolvimento e deploy.

Microsserviços e pacotes compartilhados não foram introduzidos sem uma necessidade concreta: para a V1, a complexidade adicional não traria benefício proporcional ao escopo.

### Pagamento simulado

A V1 utiliza `PaymentGateway` com `FakePaymentGateway`. O fluxo de pagamento é funcional para o domínio da aplicação, mas não movimenta dinheiro real e não possui integração com PIX, Stripe ou webhooks financeiros.

### Providers externos isolados

As integrações com TMDb e Ticketmaster ficam atrás de providers próprios da aplicação, mantendo o domínio desacoplado das APIs específicas de cada fornecedor.

### Documentação arquitetural

Os detalhes, invariantes e trade-offs estão documentados em:

* [Escopo do produto](docs/product-scope.md)
* [Escopo técnico e invariantes](docs/application-scope.md)
* [Arquitetura](docs/architecture.md)
* [Decisões técnicas](docs/technical-decisions.md)
* [Registros de decisões arquiteturais (ADRs)](docs/adr/)
* [Identidade visual](docs/ui-desicions.md)

### Uso de IA

A IA foi utilizada como ferramenta de apoio ao longo do desenvolvimento, incluindo análise, discussão de trade-offs, implementação assistida, revisão, testes e documentação.

O processo, as ferramentas utilizadas e os artefatos produzidos estão detalhados em [docs/ai-usage.md](docs/ai-usage.md). As tasks e slices que orientaram a implementação também podem ser consultadas no [GitHub Projects](https://github.com/users/issaahr/projects/3).

## Stack

| Camada               | Tecnologias                       |
| -------------------- | --------------------------------- |
| Frontend             | React, TypeScript, Vite           |
| Backend              | NestJS, TypeScript                |
| ORM                  | TypeORM                           |
| Banco de dados       | PostgreSQL                        |
| Testes               | Jest, Supertest, MSW              |
| Infraestrutura local | Docker, Docker Compose            |
| CI/CD                | GitHub Actions                    |
| Deploy               | Vercel + Heroku                   |
| APIs externas        | TMDb + Ticketmaster Discovery API |

## Como executar

Há duas formas principais de executar o projeto:

1. **Docker Compose**, recomendado para subir web, API e PostgreSQL juntos;
2. **Node.js localmente**, executando API e web de forma independente e utilizando Docker apenas para o PostgreSQL.

### Pré-requisitos

Para execução direta das aplicações:

* Node.js 22.12 ou mais recente;
* npm 10 ou mais recente.

Para execução com Docker:

* Docker;
* Docker Compose.

### 1. Configurar o ambiente

Clone o repositório e crie o arquivo `.env` a partir do exemplo:

```bash
git clone https://github.com/issaahr/nine-three-quarters-tickets.git

cd nine-three-quarters-tickets

cp .env.example .env
```

No PowerShell:

```powershell
git clone https://github.com/issaahr/nine-three-quarters-tickets.git

cd nine-three-quarters-tickets

Copy-Item .env.example .env
```

A API valida as variáveis de ambiente na inicialização. **Se uma variável obrigatória estiver ausente ou inválida, a API não inicia.**

Configure todas as variáveis obrigatórias antes de iniciar a aplicação.

### 2. Instalar as dependências

API e web possuem instalações independentes:

```bash
npm --prefix apps/api install

npm --prefix apps/web install
```

### 3. Executar com Docker

O fluxo Docker completo sobe:

* PostgreSQL;
* API;
* frontend.

```bash
docker compose up --build
```

A aplicação ficará disponível em:

* Web: http://localhost:5173
* API: http://localhost:3000
* Swagger: http://localhost:3000/docs
* PostgreSQL: `localhost:5432`

A stack utiliza bind mounts e hot reload.

O hot reload via Docker Compose é validado em Linux e WSL2. No WSL2, mantenha o repositório no filesystem Linux, por exemplo:

```text
/home/<usuario>/projetos/nine-three-quarters-tickets
```

Evite manter o repositório em `/mnt/c`, pois isso pode prejudicar a propagação dos eventos de filesystem necessários ao hot reload dos containers.

No Windows sem WSL2, o hot reload via bind mounts do Docker Compose não foi validado. Nesse ambiente, recomenda-se executar apenas o PostgreSQL via Docker e API/web nativamente com Node.js, conforme a opção abaixo.

Para encerrar:

```bash
docker compose down
```

Para remover também o volume de dados local do PostgreSQL:

```bash
docker compose down --volumes
```

### 4. Executar somente o PostgreSQL com Docker

Se preferir executar API e web diretamente com Node.js e usar Docker somente para o banco:

```bash
docker compose up postgres
```

Isso sobe apenas o PostgreSQL em:

```text
localhost:5432
```

Depois, execute a API e o frontend em terminais separados:

```bash
npm --prefix apps/api run dev
```

```bash
npm --prefix apps/web run dev
```

A API ficará disponível em:

```text
http://localhost:3000
```

e o frontend em:

```text
http://localhost:5173
```

Nesse cenário, `DATABASE_URL` deve apontar para o PostgreSQL executado pelo Docker.

## Configuração

### Variáveis obrigatórias

As seguintes variáveis são necessárias para a API iniciar corretamente:

```env
NODE_ENV=development

DATABASE_URL=postgresql://...

JWT_SECRET=...

JWT_EXPIRES_IN_SECONDS=...

TICKET_HMAC_SECRET=...

RESERVATION_HOLD_DURATION_SECONDS=...

PAYMENT_CARD_PENDING_TIMEOUT_SECONDS=...

CORS_ORIGINS=http://localhost:5173

TRUST_PROXY_HOPS=0

RATE_LIMIT_AUTH_WINDOW_SECONDS=...
RATE_LIMIT_AUTH_MAX_REQUESTS=...

RATE_LIMIT_CATALOG_WINDOW_SECONDS=...
RATE_LIMIT_CATALOG_MAX_REQUESTS=...

RATE_LIMIT_CHECK_IN_WINDOW_SECONDS=...
RATE_LIMIT_CHECK_IN_MAX_REQUESTS=...

DEMO_USERS_PASSWORD=...
```

`JWT_SECRET` deve possuir pelo menos 32 bytes.

`TICKET_HMAC_SECRET` é utilizado para proteger as credenciais dos Tickets.

`TRUST_PROXY_HOPS` deve corresponder à quantidade de proxies confiáveis existente antes da API.

As configurações de rate limiting definem as janelas e limites utilizados pela API para proteção contra abuso.

### Integrações externas

As credenciais de TMDb e Ticketmaster são utilizadas exclusivamente pelo backend e **não devem utilizar o prefixo `VITE_`**.

```env
TMDB_API_READ_ACCESS_TOKEN=...

TMDB_LANGUAGE=pt-BR

TMDB_REQUEST_TIMEOUT_MS=...

TMDB_POSTER_SIZE=w500

TICKETMASTER_API_KEY=...

TICKETMASTER_LOCALE=pt-BR

TICKETMASTER_REQUEST_TIMEOUT_MS=...
```

As integrações externas não precisam ser utilizadas para executar a aplicação localmente, mas são necessárias para utilizar os recursos que dependem dos respectivos catálogos.

### Frontend

```env
VITE_API_URL=http://localhost:3000

VITE_DEMO_USERS_PASSWORD=...
```

Variáveis com prefixo `VITE_` são incorporadas ao bundle e podem ser inspecionadas pelo navegador. **Nunca coloque segredos em variáveis `VITE_`.**

`VITE_DEMO_USERS_PASSWORD` é intencionalmente pública porque serve apenas para preencher automaticamente a senha das contas demonstrativas na interface.

A configuração do frontend também utiliza `PUBLIC_SIGNUP_ENABLED`, que não contém informação sensível e controla a apresentação do fluxo de cadastro. A API continua sendo a autoridade dessa configuração.

### Cadastro público

```env
PUBLIC_SIGNUP_ENABLED=true
```

Quando habilitado, o cadastro público cria exclusivamente contas `CUSTOMER`.

A funcionalidade é deliberadamente simples para facilitar a avaliação do projeto. A flag permite desabilitar a superfície pública de cadastro quando ela não for desejada.

Alterações nessa configuração exigem reinicialização da API e atualização/reinicialização do frontend.

## Como obter as credenciais externas

O projeto utiliza duas APIs externas de catálogo:

* TMDb para filmes;
* Ticketmaster Discovery API para shows.

As credenciais ficam exclusivamente no backend.

### TMDb

O projeto utiliza o **API Read Access Token**, e não a API Key v3 clássica.

1. Crie uma conta em https://www.themoviedb.org/
2. Acesse https://www.themoviedb.org/settings/api
3. Solicite/acesso à API conforme as instruções da TMDb.
4. Copie o **API Read Access Token**.
5. Adicione o token ao `.env`:

```env
TMDB_API_READ_ACCESS_TOKEN=seu_token
```

Também podem ser configurados:

```env
TMDB_LANGUAGE=pt-BR

TMDB_REQUEST_TIMEOUT_MS=...

TMDB_POSTER_SIZE=w500
```

### Ticketmaster Discovery API

1. Crie uma conta em https://developer.ticketmaster.com/
2. Acesse o painel de desenvolvedor.
3. Registre uma aplicação.
4. Copie a **Consumer Key** gerada para a aplicação.
5. Adicione a chave ao `.env`:

```env
TICKETMASTER_API_KEY=sua_consumer_key
```

Também podem ser configurados:

```env
TICKETMASTER_LOCALE=pt-BR

TICKETMASTER_REQUEST_TIMEOUT_MS=...
```

### Como validar as credenciais

Depois de iniciar a API, faça login com uma conta `ORGANIZER` e utilize os endpoints de catálogo pelo Swagger:

```text
http://localhost:3000/docs
```

Também é possível testar diretamente com `curl`:

```bash
curl -H "Cookie: accessToken=<token_da_sessao>" \
  "http://localhost:3000/catalog/movies/popular?page=1"
```

```bash
curl -H "Cookie: accessToken=<token_da_sessao>" \
  "http://localhost:3000/catalog/attractions/popular?page=1"
```

Uma resposta `200` contendo itens reais confirma que a integração está respondendo corretamente.

Erros `401` ou `403` indicam problema de autenticação/sessão. Erros retornados pelos providers ou timeouts indicam problema na comunicação ou na configuração da respectiva integração.

As chaves não são enviadas ao navegador e não devem ser versionadas.

## Banco de dados e migrations

A API utiliza TypeORM com PostgreSQL.

`DATABASE_URL` é obrigatória e `synchronize` permanece desabilitado. Migrations pendentes são executadas durante a inicialização da API.

Com a stack Docker em execução:

```bash
# Criar uma migration vazia
docker compose exec api npm run migration:create -- src/database/migrations/NomeDaMigration

# Gerar uma migration a partir das entities
docker compose exec api npm run migration:generate -- src/database/migrations/NomeDaMigration

# Executar migrations
docker compose exec api npm run migration:run

# Listar migrations
docker compose exec api npm run migration:show

# Reverter a última migration
docker compose exec api npm run migration:revert
```

Cada alteração de schema deve possuir uma migration correspondente.

Não utilize `synchronize` como substituto para migrations.

**Migrations não sofrem rollback automático em produção.** O rollback do deploy restaura a imagem da aplicação, mas não desfaz alterações já aplicadas ao banco. Consulte [Integração contínua e deploy](#integração-contínua-e-deploy) para o comportamento completo.

## Usuários de demonstração

A aplicação publicada possui dados de demonstração preparados para facilitar a avaliação dos principais fluxos.

A migration de seed cria quatro usuários demonstrativos:

| E-mail                        | Role        |
| ----------------------------- | ----------- |
| `organizer.demo@ntq.local`    | `ORGANIZER` |
| `customer.one.demo@ntq.local` | `CUSTOMER`  |
| `customer.two.demo@ntq.local` | `CUSTOMER`  |
| `gate.demo@ntq.local`         | `GATE`      |

Todos utilizam **a mesma senha definida em `DEMO_USERS_PASSWORD`**.

Para a avaliação do projeto publicado, a senha é:

```text
ypurp7Mkhb350taZij
```

Essa senha é compartilhada entre as contas demonstrativas apenas para facilitar a avaliação do projeto e permitir que o avaliador entre rapidamente nos diferentes perfis.

**Essa é uma decisão deliberada de ambiente demonstrativo, não uma prática recomendada para uma aplicação real.** As contas possuem credenciais conhecidas e devem ser consideradas exclusivamente contas de avaliação. Não reutilize essa senha em contas reais ou ambientes que contenham dados sensíveis.

Para habilitar os atalhos de preenchimento rápido da tela de login, configure o frontend com a mesma senha:

```env
VITE_DEMO_USERS_PASSWORD=mesma_senha_de_demo
```

`VITE_DEMO_USERS_PASSWORD` é pública por fazer parte do bundle do frontend e existe somente para facilitar a avaliação das contas demonstrativas.

### Eventos de demonstração

Eventos publicados de exemplo, incluindo filmes, shows e casos cancelados, são criados por uma seed separada das migrations.

A seed deve ser executada manualmente após a criação do organizador demo:

```bash
docker compose exec api npm run seed:events
```

A seed é idempotente: executar novamente não duplica eventos identificados pela combinação de fonte de catálogo e ID externo.

A execução é bloqueada quando `NODE_ENV=production`.

No ambiente publicado, os dados de demonstração utilizados para avaliação foram previamente provisionados.

## Autenticação

O login está disponível em:

```text
POST /auth/login
```

Após o login, o JWT é enviado em um cookie `accessToken` configurado como `HttpOnly`, impedindo que o token seja acessado diretamente por JavaScript.

O frontend restaura a sessão através de:

```text
GET /auth/session
```

e encerra a sessão com:

```text
POST /auth/logout
```

Em desenvolvimento e testes, o cookie utiliza `SameSite=Lax` sem `Secure` para funcionar em HTTP local.

Em produção, web e API estão hospedadas em sites diferentes, portanto o cookie utiliza `SameSite=None` e `Secure`.

O frontend deve enviar requisições com credenciais e a origem utilizada precisa estar configurada em `CORS_ORIGINS`.

Quando `PUBLIC_SIGNUP_ENABLED=true`, o endpoint público de cadastro cria exclusivamente usuários `CUSTOMER` e não inicia sessão automaticamente.

A documentação completa das invariantes de autenticação está em [Escopo técnico e invariantes](docs/application-scope.md).

## Scripts das aplicações

As aplicações são independentes.

### API

```bash
npm --prefix apps/api run dev

npm --prefix apps/api run build

npm --prefix apps/api run start

npm --prefix apps/api run lint

npm --prefix apps/api run format

npm --prefix apps/api run format:check
```

### Web

```bash
npm --prefix apps/web run dev

npm --prefix apps/web run build

npm --prefix apps/web run start

npm --prefix apps/web run lint

npm --prefix apps/web run format

npm --prefix apps/web run format:check
```

Não existe um script único de npm para iniciar web e API juntas. Essa coordenação pertence ao Docker Compose.

## Testes

### API

```bash
npm --prefix apps/api test

npm --prefix apps/api run test:typecheck
```

Os testes end-to-end dependem de PostgreSQL:

```bash
docker compose exec api npm run test:e2e
```

Os testes E2E de concorrência utilizam PostgreSQL real para validar propriedades transacionais que não podem ser comprovadas adequadamente apenas com mocks.

### Frontend

```bash
npm --prefix apps/web test
```

Os testes do frontend exercitam autenticação, roteamento, cache do TanStack Query e contratos HTTP simulados com MSW.

## Integração contínua e deploy

### CI

O GitHub Actions valida:

* frontend;
* API;
* PostgreSQL;
* testes;
* typecheck;
* builds production dos containers.

Os jobs utilizam os lockfiles independentes de cada aplicação e configuração determinística específica para testes.

A CI é executada em pull requests para `main` e em pushes na branch.

### CD

Após o CI passar em um push para `main`, a API é publicada automaticamente no Heroku via Container Registry.

O fluxo de deploy é:

```text
CI
 ↓
Build da imagem
 ↓
Publish
 ↓
Release no Heroku
 ↓
Health check em GET /health
 ↓
Release saudável
```

Se a nova versão não responder de forma saudável dentro do período configurado, o pipeline executa rollback para a release anterior e marca o deploy como falho.

O rollback restaura apenas a release da aplicação, não o schema do banco.

Como migrations são executadas durante a inicialização e não sofrem rollback automático, alterações de schema devem permanecer compatíveis com a release anterior até que seja seguro remover ou alterar estruturas antigas.

O frontend é publicado na Vercel através da integração nativa da Vercel com o repositório, fora do GitHub Actions.

## Limitações conhecidas

* **Cancelamento em massa de Event:** o cancelamento processa as reservas do evento em uma única transação. Com volumes muito altos, essa operação pode se tornar longa;

* **Atraso visual após expiração de hold:** a liberação do assento é refletida visualmente por reconciliação passiva, atualmente com polling de 15 segundos. O assento já está disponível para uma nova reserva antes da atualização visual;

* **Cookies HttpOnly em contextos cross-site:** navegadores com bloqueio agressivo de cookies cross-site podem impedir a persistência da sessão quando web e API estão hospedadas em domínios diferentes;

* **Locais sem CRUD:** não existe cadastro ou edição de Venues pela interface. Os locais utilizados na V1 são provisionados por seed/migration;

* **Rate limiting não distribuído:** a proteção contra abuso funciona por instância da API e não possui coordenação entre múltiplas instâncias;

* **Providers externos:** ainda não existe uma estratégia distribuída de retry, cache ou circuit breaker para as integrações externas;

* **Câmera em Firefox/Linux:** em determinados ambientes Linux, o Firefox pode rejeitar o acesso à câmera via `getUserMedia`; a validação manual por código permanece disponível.

## Fora do escopo da V1

Algumas possibilidades foram avaliadas, mas foram deixadas de fora deliberadamente para manter o escopo e a complexidade da V1 sob controle:

* integração com gateway de pagamento real;
* PIX e pagamentos financeiros reais;
* webhooks financeiros;
* envio de e-mails transacionais;
* processamento assíncrono de cancelamentos e reembolsos;
* processamento assíncrono de notificações;
* edição de dados cadastrais de usuários;
* transferência de titularidade de Tickets;
* arquitetura baseada em microsserviços.

Esses itens podem ser considerados evoluções futuras caso requisitos reais justifiquem a complexidade adicional.

## Estrutura

```text
apps/
├── api/  # NestJS + TypeScript
└── web/  # React + Vite + TypeScript
```

Cada aplicação mantém suas próprias dependências e configurações. Não existe um `package.json` compartilhado no root nem um workspace de package manager entre API e web.

Essa independência é uma decisão arquitetural registrada no [ADR 0002](docs/adr/0002-dependencias-independentes-no-monorepo.md).

## Explorar a documentação com NotebookLM

Ferramenta exploratória opcional, sem status de fonte oficial. A documentação em [`docs/`](docs/) e este README continuam sendo as referências canônicas do projeto.

[Abrir no NotebookLM](https://notebook.google.com/notebook/e9c72c21-e088-4e56-8065-6997f156fcbc)

O notebook possui grounding restrito aos arquivos de `docs/` e a este README, sem conhecimento externo.

Perguntas de partida sugeridas:

* Como o sistema garante que o mesmo assento nunca é vendido duas vezes?
* Como funciona a credencial do ingresso e por que ela não pode ser forjada?
* O que acontece se o pagamento falhar depois que o hold do assento já expirou?
* Por que a portaria opera vinculada a um evento por sessão, e não globalmente?

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
