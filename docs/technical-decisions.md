# Decisões técnicas do 9¾ Tickets

Este documento reúne decisões aceitas que orientam a implementação corrente. Decisões com alternativas arquiteturais relevantes possuem ADR próprio.

## Repositório e execução

- API e web mantêm dependências, locks e scripts independentes.
- O root não possui `package.json` nem workspace de package manager.
- Docker Compose coordena a execução conjunta.
- O desenvolvimento com bind mount e hot reload é suportado em Linux e WSL2 sobre filesystem Linux.
- O repositório utiliza LF como fim de linha padrão por meio de `.gitattributes`.

Consulte o [ADR 0002](adr/0002-dependencias-independentes-no-monorepo.md).

## Configuração

- O `.env` no root é a fonte local de configuração para as duas aplicações e para o Compose.
- Variáveis obrigatórias não possuem fallback silencioso.
- A API valida conjuntamente sua configuração HTTP antes de iniciar.
- A configuração de banco permanece separada porque também é consumida pelo CLI de migrations.
- Somente variáveis públicas são incorporadas ao bundle do Vite.
- `PUBLIC_SIGNUP_ENABLED` é exposta explicitamente ao frontend e validada também pela API.
- Alterar a flag exige reiniciar a API e reconstruir ou reiniciar o frontend.

## Banco de dados

- PostgreSQL 17 é o banco da V1.
- TypeORM utiliza Data Mapper e `Repository<T>` diretamente quando suficiente.
- `synchronize` é desabilitado; migrations pendentes executam na inicialização.
- Timestamps de migrations são produzidos pelos comandos do TypeORM e mantêm ordem cronológica.
- Constraints do banco protegem invariantes estruturais e concorrentes.

## Catálogo e horário de Events

- A API autentica na TMDb com API Read Access Token em Bearer; a credencial nunca é exposta ao frontend.
- `TmdbCatalogProvider` utiliza o `fetch` nativo do Node e normaliza respostas externas para `CatalogItem`.
- A descoberta inicial usa filmes populares da TMDb; descoberta e pesquisa preservam paginação em um contrato normalizado próprio.
- Gêneros e configuração de imagens são mantidos apenas em cache de processo e uma falha não permanece cacheada.
- A criação de filme recebe somente identidade externa e dados locais; o snapshot é reconstruído pela API antes de persistir o Event.
- Chamadas externas não ocorrem dentro de transações PostgreSQL.
- Horários informados pelo organizador são interpretados no timezone IANA do Venue por `@js-temporal/polyfill`.
- Horários locais inexistentes ou ambíguos em transições de offset são rejeitados em vez de ajustados silenciosamente.
- Testes e CI substituem a port de catálogo e não dependem da disponibilidade real da TMDb.

## Publicação e inventário SEATED

- A publicação é uma transição explícita de `DRAFT` para `PUBLISHED`.
- Para Events `SEATED`, publicação e materialização de `EventSeat` acontecem na mesma transação PostgreSQL.
- O Event é bloqueado durante a transição; chamadas concorrentes para um Event já publicado são idempotentes e não recriam inventário.
- Cada `VenueSeat` aplicável produz exatamente um `EventSeat`, protegido por `UNIQUE(eventId, venueSeatId)`.
- O status percebido do assento é derivado de `holdReservationId`, `holdExpiresAt` e `soldAt`; não existe enum persistido de disponibilidade.
- A listagem privada usa `GET /organizer/me/events` e deriva o proprietário exclusivamente da sessão autenticada.
- O frontend executa criação e publicação como ações separadas. Se somente a publicação falhar, o DRAFT permanece recuperável no painel.

Consulte o [ADR 0004](adr/0004-materializacao-transacional-do-inventario-seated.md).

## Reservations temporárias SEATED

- `Reservation`, seus `ReservationItem` e a aquisição de todos os `EventSeat` solicitados são persistidos na mesma transação PostgreSQL.
- A aquisição utiliza um `UPDATE` condicional que aceita somente assentos não vendidos e sem hold válido; divergência entre a quantidade solicitada e a quantidade afetada reverte a transação inteira.
- O preço de cada item é fotografado de `Event.priceCents` durante a criação e não é aceito do frontend.
- `CURRENT_TIMESTAMP` do PostgreSQL determina criação, validade e expiração; a duração do hold vem de `RESERVATION_HOLD_DURATION_SECONDS`.
- A correção da expiração não depende de scheduler: um hold com `holdExpiresAt` vencido pode ser substituído por uma nova aquisição válida.
- A reserva ativa por CUSTOMER/Event é uma política de fluxo. Não são usados advisory lock, lock artificial de User ou infraestrutura adicional para transformá-la em invariante crítica.
- O cancelamento bloqueia a `Reservation`, valida seu estado com o horário do banco e libera somente os assentos cujo `holdReservationId` ainda corresponde a ela, no mesmo commit.
- O checkout é uma rota autenticada de CUSTOMER. Seu countdown deriva de `expiresAt`, provoca nova consulta ao chegar a zero e nunca substitui a validação autoritativa da API.

Consulte o [ADR 0005](adr/0005-aquisicao-atomica-e-expiracao-de-holds-seated.md).

## Descoberta pública de Events

- `GET /events` é público e consulta exclusivamente snapshots persistidos localmente.
- A descoberta padrão retorna apenas Events `PUBLISHED` com `startsAt` futuro; filtros de calendário explícitos também podem consultar Events passados da data selecionada.
- `GET /events/:eventId` admite `PUBLISHED` passados e `CANCELLED`, responde como não encontrado para DRAFT e recebe `isPast` calculado pelo PostgreSQL.
- A paginação usa página numérica, tamanho fixo e `hasMore`, contrato compatível com carregamento infinito sem executar `COUNT(*)` a cada requisição.
- Busca e filtros são combináveis; texto é normalizado e curingas SQL informados pelo cliente são tratados literalmente.
- Filtros de calendário comparam cada ocorrência segundo o timezone IANA de seu Venue.
- A ordenação por `startsAt` e `id` mantém páginas determinísticas dentro do modelo simples baseado em offset.

## Autenticação e autorização

- Senhas utilizam bcrypt com custo 12.
- Cadastro exige entre 8 caracteres e 72 bytes UTF-8 para evitar truncamento silencioso do bcrypt.
- O access token JWT utiliza HS256, segredo obrigatório com ao menos 32 bytes e expiração configurável.
- O JWT é enviado somente por cookie HttpOnly; não existe token em `localStorage` nem refresh token na V1.
- `GET /auth/session` retorna `200` para sessão válida e `204` quando não há sessão, pois ausência de autenticação é um resultado esperado dessa consulta.
- Login não distingue email inexistente de senha incorreta e mantém custo de bcrypt nos dois casos.
- Papéis presentes no JWT são validados e a autorização efetiva ocorre em guards da API.
- CORS e atributos do cookie são derivados de configuração. A política deve ser revisada para a topologia real de produção.

Consulte o [ADR 0003](adr/0003-autenticacao-jwt-em-cookie-http-only.md).

## Cadastro público

- `POST /auth/signup` existe somente quando `PUBLIC_SIGNUP_ENABLED` está habilitada.
- Cadastro público cria exclusivamente `CUSTOMER`.
- A confirmação de senha pertence ao formulário e não faz parte do contrato HTTP.
- O cadastro não inicia sessão automaticamente.
- A constraint `usersEmailUnique` decide atomicamente duplicidades; não existe read-then-write como autoridade.
- Com a flag desabilitada, a API retorna recurso indisponível e o frontend remove o acesso ao fluxo.

## Frontend

- React Router organiza rotas públicas, autenticadas e específicas por papel.
- TanStack Query é o estado remoto da sessão.
- `useInfiniteQuery` coordena a paginação incremental dos catálogos público e do organizador sem duplicar páginas em estado local.
- Axios envia cookies com `withCredentials`.
- Zod e React Hook Form validam formulários antes do envio; DTOs repetem a validação autoritativa na API.
- Tailwind CSS 4 fornece tokens e composição visual.
- Componentes Shadcn no estilo Base Nova são incorporados como código local somente quando existe uso concreto.
- `react-number-format` trata a entrada monetária para preservar cursor, colagem e separadores sem reimplementar uma máscara própria.
- A navegação por papel no frontend é UX e nunca substitui autorização no backend.
- CUSTOMER e ORGANIZER usam a superfície clara; GATE usa a superfície escura operacional.
- Imports diretos são preferidos. Um `index.ts` só deve existir quando houver uma fronteira pública concreta para representar.

## Contratos e documentação de código

- Entidades TypeORM não são contratos HTTP.
- DTOs públicos possuem validação em runtime e metadados Swagger.
- Conjuntos de decorators Swagger são compostos fora dos controllers.
- TSDoc em português documenta intenção, restrições ou efeitos não evidentes; comentários não repetem o código.
- Interfaces compartilhadas são extraídas quando organizam múltiplos consumidores. Tipos locais ficam próximos do arquivo responsável.

## Testes

- Jest cobre regras e integração da API.
- Comportamento de PostgreSQL, constraints, transações e concorrência é testado contra PostgreSQL real.
- Vitest, Testing Library e MSW cobrem fluxo, acessibilidade, roteamento e contratos HTTP do frontend.
- Mocks não são usados como prova de invariantes que pertencem ao banco.

## Integração contínua

- GitHub Actions valida pull requests para `main` e todo push em `main`.
- Web e API possuem jobs independentes, cada um com cache baseado no próprio lockfile.
- O job da API utiliza PostgreSQL 17 real para executar a suíte end-to-end.
- Builds production dos dois containers são validados somente depois dos jobs das aplicações.
- A CI utiliza valores concretos e determinísticos exclusivos para teste, definidos no próprio workflow. Nenhuma credencial real ou configuração de deploy é utilizada pelos jobs.
- Valores destinados exclusivamente ao ambiente de teste não são tratados como GitHub Actions Secrets.
- A CI não publica imagens e não executa `npm audit` como bloqueio de merge.
- Hooks locais não são obrigatórios; a CI é a autoridade dos checks exigidos para integração.
