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

Plataforma full-stack de eventos e ingressos com descoberta de filmes e shows, reserva de assentos, entrada geral, checkout simulado ou Stripe Checkout em sandbox, emissão de Tickets com QR Code e validação na portaria.

## Aplicação publicada

[Experimentar 9¾ Tickets sem conta](https://nine-three-quarters-tickets.vercel.app/demo)

|                                   |                                                                     |
| --------------------------------- | ------------------------------------------------------------------- |
| **Web**                           | https://nine-three-quarters-tickets.vercel.app/                     |
| **API**                           | https://nine-three-quarters-tickets-1bf4ca494ed2.herokuapp.com/     |
| **Documentação da API (Swagger)** | https://nine-three-quarters-tickets-1bf4ca494ed2.herokuapp.com/docs |

O frontend está hospedado na Vercel e a API no Heroku, permitindo deploy independente das aplicações.

**Para avaliar o checkout, use apenas dados fictícios.** A integração usa o serviço da Stripe em sandbox para que testadores possam completar cartão e Pix sem risco de cobrança acidental. Nenhuma compra nesse modo movimenta dinheiro. O modo fake também está disponível para demonstração. [Ambientes de teste da Stripe](https://docs.stripe.com/sandboxes)

## Funcionalidades

### CUSTOMER

* descoberta de filmes e shows;
* busca, filtros e ordenação de eventos;
* eventos com assentos numerados;
* eventos com entrada geral;
* reserva temporária de inventário;
* checkout de cartão e Pix em modo simulado ou no sandbox da Stripe;
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
* Ticketmaster Discovery API para descoberta de shows;
* Stripe Checkout hospedado para pagamentos de teste em BRL.

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

### Pagamentos de teste

O checkout simulado oferece cartão via `FakePaymentGateway` e Pix com QR de demonstração. No modo Stripe, a aplicação abre o Checkout hospedado e recupera a tentativa persistida ao retornar ou recarregar a reserva. O backend concilia a cobrança com a Stripe e revalida o prazo e o inventário no PostgreSQL antes de emitir os ingressos. Ambos os modos operam sem movimentação financeira.

### Providers externos isolados

As integrações com TMDb, Ticketmaster e Stripe ficam atrás de interfaces próprias da aplicação, mantendo o domínio desacoplado das APIs específicas de cada fornecedor.

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
| APIs externas        | TMDb, Ticketmaster Discovery API e Stripe (sandbox) |

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

Clone o repositório e copie os três exemplos de configuração:

```bash
git clone https://github.com/issaahr/nine-three-quarters-tickets.git

cd nine-three-quarters-tickets

cp env/postgres.env.example env/postgres.env
cp env/api.env.example env/api.env
cp env/web.env.example env/web.env
```

No PowerShell:

```powershell
git clone https://github.com/issaahr/nine-three-quarters-tickets.git

cd nine-three-quarters-tickets

Copy-Item env/postgres.env.example env/postgres.env
Copy-Item env/api.env.example env/api.env
Copy-Item env/web.env.example env/web.env
```

A API valida as variáveis de ambiente na inicialização. **Se uma variável obrigatória estiver ausente ou inválida, a API não inicia.**

| Arquivo local | Uso |
| --- | --- |
| `env/postgres.env` | `POSTGRES_DB`, `POSTGRES_USER` e `POSTGRES_PASSWORD` para o serviço PostgreSQL. |
| `env/api.env` | `DATABASE_URL`, configuração HTTP e segredos do backend, incluindo JWT, Tickets, catálogos e Stripe. |
| `env/web.env` | Configuração pública do frontend, como `VITE_API_URL` e `PUBLIC_SIGNUP_ENABLED`. |

Preencha as variáveis obrigatórias e mantenha usuário, senha e banco de `DATABASE_URL` compatíveis com o PostgreSQL configurado. O Compose injeta o arquivo de cada serviço com `env_file`. As credenciais da API entram no processo da API por esse arquivo e não precisam ser interpoladas no YAML. CI e deploy podem fornecer as variáveis diretamente ao processo.

**Se a instalação já usa o antigo `.env` compartilhado**, distribua os valores manualmente seguindo os exemplos. Copie `POSTGRES_*` para `env/postgres.env`, transfira as configurações e credenciais do backend para `env/api.env` e copie apenas as opções públicas para `env/web.env`. Transfira também para a API as chaves Stripe que estiverem em um antigo `.stripe-api.env`. Configure `PUBLIC_SIGNUP_ENABLED` nos dois aplicativos com o mesmo valor. Preserve as credenciais do PostgreSQL em uso e, após conferir os novos arquivos, retire os arquivos antigos da raiz. Recrie os containers com `docker compose up -d --build --force-recreate` para aplicar a separação, preservando os volumes. Em execução nativa, reinicie os processos com as novas configurações.

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

Nesse cenário, ajuste o host em `DATABASE_URL` no `env/api.env` para `localhost`. Use o host `postgres` quando a API também roda dentro do Compose. Em ambos os casos, o navegador acessa a API pelo endereço público definido em `VITE_API_URL`, como `http://localhost:3000`.

## Configuração

### Variáveis obrigatórias

Configure as seguintes variáveis obrigatórias em `env/api.env` para executar localmente:

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

### Stripe Checkout em sandbox

Defina `PAYMENT_PROVIDER=fake` em `env/api.env` para a demonstração local. Esse também é o comportamento quando a variável é omitida. O modo `stripe` exige a chave de sandbox `PAYMENT_STRIPE_SECRET_KEY` e o segredo de assinatura `PAYMENT_STRIPE_WEBHOOK_SECRET`. A primeira origem de `CORS_ORIGINS` monta o endereço de retorno de novas tentativas. [Obter as credenciais Stripe](#stripe)

A Stripe CLI encaminha eventos locais a `POST /payments/webhooks/stripe`. A API concilia pagamentos e estornos pendentes e pode localizar uma sessão mesmo quando a resposta de criação e o webhook se perdem. O guia descreve configuração, migração de credenciais e o roteiro de teste. [Guia de validação](docs/stripe-sandbox-validation.md) · [ADR 0007](docs/adr/0007-stripe-checkout-hospedado-no-sandbox.md)

Compras gratuitas são confirmadas localmente. Para totais positivos em BRL, o checkout hospedado exige pelo menos R$ 0,50, com teto de R$ 999.999,99 no Pix e de R$ 21.474.836,47 no cartão pela capacidade local de armazenamento. A rede do cartão pode aplicar um teto menor. [Limites de valores da Stripe](https://docs.stripe.com/currencies#minimum-and-maximum-charge-amounts)

### Integrações externas

Configure as credenciais de TMDb e Ticketmaster somente em `env/api.env`, para uso pelo backend.

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

Defina as opções públicas em `env/web.env`:

```env
VITE_API_URL=http://localhost:3000
PUBLIC_SIGNUP_ENABLED=true
```

O build incorpora explicitamente `VITE_API_URL` e `PUBLIC_SIGNUP_ENABLED`. Esses valores ficam disponíveis para o navegador. Mantenha os segredos da aplicação em `env/api.env`.

A flag pública `PUBLIC_SIGNUP_ENABLED` controla a apresentação do fluxo de cadastro. A API valida sua própria configuração e continua sendo a autoridade sobre a ação.

### Cadastro público

```env
PUBLIC_SIGNUP_ENABLED=true
```

Configure a flag com o mesmo valor em `env/api.env` e `env/web.env`. Quando habilitado, o cadastro público cria exclusivamente contas `CUSTOMER`.

A funcionalidade é deliberadamente simples para facilitar a avaliação do projeto. A flag permite desabilitar a superfície pública de cadastro quando ela não for desejada.

Alterações nessa configuração exigem reiniciar a API e o Web no desenvolvimento. Em produção, gere um novo build do frontend para incorporar a flag.

## Como obter as credenciais externas

O projeto usa as APIs de catálogo e a integração de pagamentos em sandbox:

* TMDb para filmes;
* Ticketmaster Discovery API para shows;
* Stripe Checkout hospedado para testes de cartão e Pix.

As credenciais ficam exclusivamente no backend.

### TMDb

O projeto utiliza o **API Read Access Token**, e não a API Key v3 clássica.

1. Crie uma conta em https://www.themoviedb.org/
2. Acesse https://www.themoviedb.org/settings/api
3. Solicite/acesso à API conforme as instruções da TMDb.
4. Copie o **API Read Access Token**.
5. Adicione o token ao `env/api.env`:

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
5. Adicione a chave ao `env/api.env`:

```env
TICKETMASTER_API_KEY=sua_consumer_key
```

Também podem ser configurados:

```env
TICKETMASTER_LOCALE=pt-BR

TICKETMASTER_REQUEST_TIMEOUT_MS=...
```

### Stripe

1. No Dashboard Stripe, crie ou selecione um sandbox. Para reproduzir a configuração validada, use uma conta brasileira com Pix disponível. Ative cartão e Pix nas configurações de métodos de pagamento do sandbox. [Sandboxes](https://docs.stripe.com/sandboxes) · [Configuração do Pix](https://docs.stripe.com/payments/pix/accept-a-payment?payment-ui=checkout)
2. Com o sandbox selecionado, abra **Chaves de API** e revele a chave secreta de teste `sk_test_...`. Use essa chave em `PAYMENT_STRIPE_SECRET_KEY`. O Checkout hospedado usa a sessão criada pela API e dispensa chave publicável no Web. [Chaves de API no Dashboard](https://dashboard.stripe.com/apikeys) · [Tipos de chave](https://docs.stripe.com/keys)
3. Para desenvolvimento local, instale a Stripe CLI e configure `STRIPE_API_KEY` no processo da CLI com a chave de teste do mesmo sandbox. Execute o listener abaixo e copie o segredo `whsec_...` exibido para `PAYMENT_STRIPE_WEBHOOK_SECRET`. Se usar o Dashboard, crie um destino de eventos do tipo **Snapshot** para a URL HTTPS da sua API no caminho `/payments/webhooks/stripe`, selecione os quatro eventos listados abaixo e revele o segredo desse destino. [Instalação da Stripe CLI](https://docs.stripe.com/cli/install) · [Encaminhamento local](https://docs.stripe.com/cli/listen) · [Configurar um endpoint](https://docs.stripe.com/webhooks)

   ```bash
   stripe listen --events checkout.session.completed,checkout.session.async_payment_succeeded,checkout.session.async_payment_failed,checkout.session.expired --forward-to http://localhost:3000/payments/webhooks/stripe
   ```

4. Preencha os valores no `env/api.env` e reinicie a API. Em Compose, recrie o serviço com `docker compose up -d --force-recreate api`. O guia tem passos para verificar o retorno ao Web e a entrega de webhooks. [Reprodução pelo Web](docs/stripe-sandbox-validation.md#reprodução-pelo-web)

   ```env
   PAYMENT_PROVIDER=stripe
   PAYMENT_STRIPE_SECRET_KEY=<chave-sk_test-do-sandbox>
   PAYMENT_STRIPE_WEBHOOK_SECRET=<segredo-whsec-do-listener-ou-destino>
   ```

### Como validar as credenciais de catálogo

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

## Demonstração pública

Em `/demo`, acesse o catálogo ou visite as telas do organizador e da portaria. As visitas funcionam sem conta e permitem consultar eventos publicados no catálogo. Criar ou gerenciar eventos, consultar catálogos externos e validar ingressos exige login com o papel correspondente.

O [catálogo público](https://nine-three-quarters-tickets.vercel.app/events) também pode ser consultado sem conta. Para testar a compra pelo fluxo completo da aplicação, use uma conta de cliente quando o cadastro público estiver habilitado.

### Dados locais e testes

A migration histórica cria usuários de desenvolvimento e teste a partir de `DEMO_USERS_PASSWORD`. Configure um valor privado para seu ambiente local. A rota `/demo` funciona independentemente desse seed.

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
PAYMENT_PROVIDER=fake npm --prefix apps/api test

npm --prefix apps/api run test:typecheck
```

Os testes end-to-end dependem de PostgreSQL:

```bash
docker compose exec -e PAYMENT_PROVIDER=fake api npm run test:e2e
```

Para executar a suíte E2E com a API fora do Compose, use `PAYMENT_PROVIDER=fake npm --prefix apps/api run test:e2e` com um PostgreSQL de teste. No PowerShell, defina `$env:PAYMENT_PROVIDER = 'fake'` antes de executar os comandos npm no terminal de testes.

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

* **Conciliação Stripe:** a API processa pagamentos e estornos em um worker local. Após reinício, ele retoma a partir do PostgreSQL. Uma criação cujo resultado segue inconclusivo bloqueia outra cobrança para a mesma reserva. O vencimento do hold continua liberando o inventário;

* **Providers de catálogo:** as integrações de catálogo usam políticas locais de cache e falhas, sem estratégia distribuída de cache, retry ou circuit breaker;

* **Câmera em Firefox/Linux:** em determinados ambientes Linux, o Firefox pode rejeitar o acesso à câmera via `getUserMedia`; a validação manual por código permanece disponível.

## Fora do escopo da V1

Algumas possibilidades foram avaliadas, mas foram deixadas de fora deliberadamente para manter o escopo e a complexidade da V1 sob controle:

* pagamentos financeiros reais;
* webhooks e estornos financeiros em produção;
* envio de e-mails transacionais;
* processamento assíncrono do cancelamento em massa de eventos;
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
