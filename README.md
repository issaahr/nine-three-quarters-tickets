<p align="center">
  <img src="docs/readme-banner.png" alt="9¾ Tickets" width="800" />
</p>

# 9¾ Tickets

Código fonte da plataforma 9¾ Tickets.

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
- `CORS_ORIGINS`: origens permitidas, separadas por vírgula.
- `PUBLIC_SIGNUP_ENABLED`: habilita (`true`) ou desabilita (`false`) o cadastro público;
- `TMDB_API_READ_ACCESS_TOKEN`: token Bearer mantido exclusivamente no backend;
- `TMDB_LANGUAGE`: idioma regional das respostas da TMDb, como `pt-BR`;
- `TMDB_REQUEST_TIMEOUT_MS`: limite em milissegundos para cada chamada externa;
- `TMDB_POSTER_SIZE`: tamanho de poster exigido da configuração da TMDb, como `w500`;
- `VITE_API_URL`: endereço público pelo qual o navegador acessa a API;
- `VITE_DEMO_USERS_PASSWORD`: senha pública preenchida pelos atalhos de demonstração.

Variáveis com prefixo `VITE_` são incorporadas ao bundle e podem ser inspecionadas no navegador. Nunca utilize esse prefixo em segredos. `VITE_DEMO_USERS_PASSWORD` é intencionalmente pública e deve ser usada somente nas contas demonstrativas. A configuração do Vite também expõe exclusivamente `PUBLIC_SIGNUP_ENABLED`, que não contém informação sensível e controla apenas a apresentação do fluxo; a API continua sendo a autoridade da flag.

O token de leitura pode ser obtido nas configurações de API de uma conta da TMDb. Ele não utiliza prefixo `VITE_`, não é enviado ao navegador e não deve ser versionado.

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

| Email                         | Role        |
| ----------------------------- | ----------- |
| `organizer.demo@ntq.local`    | `ORGANIZER` |
| `customer.one.demo@ntq.local` | `CUSTOMER`  |
| `customer.two.demo@ntq.local` | `CUSTOMER`  |
| `gate.demo@ntq.local`         | `GATE`      |

Todos utilizam a senha definida em `DEMO_USERS_PASSWORD`. Essas contas são destinadas exclusivamente à demonstração; defina a variável no `.env` antes de iniciar um banco novo e não reutilize essa senha em contas reais.

Para que os atalhos da tela de login preencham a mesma credencial, defina `VITE_DEMO_USERS_PASSWORD` com o mesmo valor. Essa segunda variável é pública por fazer parte do bundle do frontend; ela não deve ser reutilizada fora do ambiente demonstrativo.

## Autenticação

O login está disponível em `POST /auth/login`. Em caso de sucesso, a resposta contém somente os dados públicos do usuário e o JWT é enviado no cookie `accessToken`, inacessível a JavaScript por ser `HttpOnly`.

O frontend pode restaurar a identidade autenticada por `GET /auth/session`. Uma sessão válida retorna `200` com somente `id` e `role`; cookie ausente ou inválido retorna `204`, pois a ausência de sessão é um resultado esperado dessa consulta. O token continua inacessível ao JavaScript. `POST /auth/logout` encerra a sessão expirando o cookie e pode ser chamado mesmo quando ele já estiver ausente ou inválido.

Em desenvolvimento e testes, o cookie utiliza `SameSite=Lax` sem `Secure` para funcionar em HTTP local. Em produção, utiliza `SameSite=None` e `Secure` para permitir que web e API estejam em sites diferentes. O cliente deve enviar requisições com credenciais e a origem precisa estar declarada em `CORS_ORIGINS`.

Quando `PUBLIC_SIGNUP_ENABLED=true`, `POST /auth/signup` cria exclusivamente uma conta `CUSTOMER` e a tela de login oferece acesso ao formulário público. O cadastro não inicia sessão automaticamente. Alterar a flag exige reiniciar a API e reconstruir ou reiniciar o frontend; com `false`, o frontend remove o fluxo e a API responde que o endpoint está indisponível.

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

O GitHub Actions valida web, API com PostgreSQL e os builds production dos containers em pull requests para `main` e pushes na branch. Os jobs respeitam os lockfiles independentes de cada aplicação, utilizam configuração determinística exclusiva para testes definida no workflow e não publicam imagens.

## Componentes do frontend

O frontend utiliza Tailwind CSS 4 e componentes Shadcn no estilo Base Nova. Os componentes são gerados como código local em `apps/web/src/components/ui` e devem ser adicionados somente quando uma necessidade concreta da interface justificar.

Para adicionar um componente a partir do root:

```bash
npm --prefix apps/web exec -- shadcn add <componente>
```

Não envolva componentes Shadcn em novas abstrações sem comportamento ou responsabilidade adicional.

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
</table>
