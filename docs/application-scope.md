# 9¾ Tickets — Application Scope

## 1. Objetivo

Este documento define o escopo técnico da V1 do 9¾ Tickets.

O foco é construir uma aplicação full-stack de ticketing que:

- preserve corretamente inventário sob concorrência;
- mantenha pagamentos simulados idempotentes;
- emita ingressos individualmente;
- valide check-in de forma atômica;
- suporte eventos com assentos e entrada geral;
- mantenha integrações externas isoladas do domínio transacional;
- possa ser executada localmente e demonstrada publicamente.

A arquitetura deve favorecer clareza, correção e velocidade de implementação.

A V1 evita abstrações cuja única justificativa seja antecipar requisitos futuros.

---

## 2. Stack

### Frontend

- React
- Vite
- TypeScript
- TanStack Query

### Backend

- Node.js
- NestJS
- TypeScript

### Persistência

- PostgreSQL
- TypeORM

### Infraestrutura local

- Docker Compose

### Realtime

- Socket.IO através do NestJS

### Estrutura do repositório

Monorepo simples utilizando workspaces do package manager:

```text
apps/
├── web/
└── api/
```

Um package compartilhado só deve ser introduzido quando existir uma necessidade concreta.

Não faz parte da fundação da V1:

- Turborepo;
- Nx;
- múltiplos serviços;
- microservices;
- package genérico de domínio compartilhado por antecipação.

OBS: Regra parcialmente modificada conforme [ADR-0002](./adr/0002-dependencias-independentes-no-monorepo.md)

---

## 3. Estratégia arquitetural

A aplicação utiliza um **modular monolith**.

O backend é uma única aplicação NestJS organizada por módulos de negócio.

Módulos previstos incluem:

- Auth
- Catalog
- Events
- Venues
- Reservations
- Payments
- Tickets
- CheckIn
- Realtime

Os módulos podem colaborar diretamente quando isso mantiver o fluxo claro.

A V1 não adota uma arquitetura hexagonal completa nem exige ports/adapters para cada classe.

### Ports

Interfaces são introduzidas principalmente em fronteiras externas ou voláteis.

Exemplos:

```ts
interface CatalogProvider {
  search(...): Promise<CatalogItem[]>;
}

interface PaymentGateway {
  process(...): Promise<PaymentResult>;
}
```

São bons candidatos:

- TMDb;
- Ticketmaster;
- gateway de pagamento simulado.

Não serão criadas interfaces automaticamente para:

- cada service;
- cada repository;
- cada use case;
- cada módulo interno.

---

## 4. Princípios de implementação

### Banco como autoridade

PostgreSQL é a fonte de verdade para:

- disponibilidade;
- holds;
- vendas;
- pagamentos;
- tickets;
- cancelamentos;
- check-in.

O frontend, WebSocket e caches não podem ser responsáveis por garantir invariantes transacionais.

### Invariantes no backend

Controles de UX podem reduzir erros, mas não substituem garantias do servidor.

Exemplos:

- desabilitar botão de pagamento evita double-click visualmente;
- a API ainda deve ser idempotente;
- esconder botão de ORGANIZER para CUSTOMER melhora a interface;
- o backend ainda deve aplicar autorização;
- WebSocket atualiza mapa;
- o banco ainda decide quem conseguiu reservar o assento.

### Complexidade proporcional ao risco

Abstrações ou infraestrutura adicional devem justificar seu custo pela combinação de:

- probabilidade do problema;
- impacto do problema;
- dificuldade de recuperação.

---

## 5. TypeORM

A V1 utiliza TypeORM por familiaridade e velocidade de implementação.

Isso não implica uso de Active Record.

### Base entity

Pode existir uma classe abstrata da aplicação, por exemplo:

```ts
abstract class BaseEntity {
  id: string;
  createdAt: Date;
  updatedAt: Date;
}
```

Timestamps semânticos permanecem explícitos nas entidades.

Exemplos:

- `expiresAt`;
- `confirmedAt`;
- `cancelledAt`;
- `approvedAt`;
- `checkedInAt`;
- `issuedAt`.

### Repositories

`Repository<T>` do TypeORM pode ser utilizado diretamente quando suficiente.

Custom repositories ou classes de persistência específicas são justificadas quando existir:

- QueryBuilder complexo;
- locking;
- update condicional;
- consulta semântica repetida;
- lógica de concorrência importante.

Possíveis candidatos:

- EventRepository
- EventSeatRepository
- ReservationRepository
- PaymentRepository
- TicketRepository

Inicialmente não existe `BaseRepository` genérico na V1.

---

## 6. Transações

Transações devem permanecer explícitas nos fluxos em que múltiplas escritas formam uma única operação.

Dentro de uma transaction:

- utilizar o `EntityManager` daquela transaction;
- utilizar repositories obtidos a partir daquele manager;
- não utilizar repositories globais para leituras/escritas que fazem parte da operação.

Exemplo conceitual:

```text
transaction
├── validar inventário
├── criar Reservation
├── criar ReservationItems
├── adquirir EventSeats
└── commit
```

Operações externas lentas, como chamada ao PaymentGateway, **não permanecem dentro de transaction aberta**.

---

## 7. User e autenticação

### Roles

```text
ORGANIZER
CUSTOMER
GATE
```

### Autenticação

A V1 utiliza:

- email;
- password hash;
- JWT;
- cookie HttpOnly.

O access token não é armazenado em `localStorage`.

Não existe refresh token na V1.

Ao expirar a sessão, o usuário autentica novamente.

### Autorização

NestJS Guards protegem endpoints por autenticação e role.

A autorização do backend é a regra efetiva.

Controle visual no frontend é somente UX.

### Cadastro

Se cadastro público estiver habilitado:

- cria exclusivamente CUSTOMER;
- pode ser controlado por feature flag/configuração;
- nunca permite cadastro público de ORGANIZER ou GATE.

Não fazem parte da V1:

- password recovery;
- email verification;
- OAuth.

---

## 8. Cookies, CORS e deploy

Localmente, web e API podem ser executados pela stack Docker.

Em produção, a V1 não assume que frontend e backend estarão no mesmo site.

É aceitável utilizar, por exemplo:

```text
frontend → domínio do provider A
API      → domínio do provider B
```

Nesse cenário, a configuração deve ser revisada de acordo com a topologia real.

Possível configuração para cookie cross-site:

- `HttpOnly`;
- `Secure` em produção;
- `SameSite=None` quando necessário;
- requests frontend com `credentials`;
- CORS com origem explicitamente permitida.

`Access-Control-Allow-Origin: *` não deve ser usado em conjunto com credenciais.

### CSRF

CORS não deve ser tratado como proteção completa contra CSRF.

A configuração final de autenticação deve passar por uma revisão de segurança no momento do deploy, quando os domínios reais forem conhecidos.

A documentação não deve afirmar que CSRF está resolvido antes dessa revisão.

---

## 9. Venue

`Venue` representa o local físico do Event.

Campos relevantes incluem:

- name;
- address;
- city;
- state;
- country;
- timeZone.

`timeZone` utiliza identificador IANA.

Exemplo:

```text
America/Sao_Paulo
```

### V1

Venues são pré-configurados/seedados.

O ORGANIZER seleciona um Venue existente.

Não existe editor de Venue ou layout na V1.

---

## 10. VenueSeat

`VenueSeat` representa a configuração física reutilizável de um assento.

Exemplo de campos:

```text
id
venueId
label
row
number
x
y
```

`x` e `y` são coordenadas lógicas de layout.

O frontend não possui fileiras ou posições hardcoded.

Espaços físicos como corredores podem simplesmente ser representados pela ausência de assentos em determinadas coordenadas.

---

## 11. Event

`Event` é uma ocorrência local específica.

Campos conceituais:

```text
id
organizerId
venueId

title
description
imageUrl

category
admissionMode
status

startsAt
priceCents

capacity

catalogProvider
externalId

genres
```

### Categoria

```text
MOVIE
SHOW
```

### Admission mode

```text
SEATED
GENERAL_ADMISSION
```

Na V1:

```text
MOVIE → SEATED
SHOW  → GENERAL_ADMISSION
```

Essa associação é uma restrição do produto atual, não uma regra arquitetural universal.

### Uma ocorrência por Event

Cada Event possui um único `startsAt`.

A aplicação não precisa modelar:

- sessão pai;
- lista de horários;
- recurring event;
- EventGroup;
- Schedule;
- Session entity.

Se futuramente houver agrupamento de sessões, múltiplos Events existentes poderão ser associados a uma entidade superior sem redefinir Event.

---

## 12. Ausência de EventSector

A V1 não possui `EventSector`.

Preço, modalidade de admissão e capacidade aplicáveis permanecem diretamente no Event.

Não serão implementados agora:

- pista + camarote;
- VIP;
- setor com assento;
- preço por setor;
- capacidade por setor.

Uma evolução futura pode introduzir algo como:

```text
Event
└── EventSector
    ├── admissionMode
    ├── price
    └── capacity/config
```

Essa evolução poderá exigir migration.

Evitar essa migration futura não é justificativa suficiente para introduzir setores na V1.

Componentes posteriores como:

- Payment;
- Ticket;
- Refund;
- CheckIn;

não devem depender da existência de setores.

---

## 13. EventSeat

`EventSeat` representa o inventário de um assento físico em uma ocorrência específica.

Exemplo:

```text
id
eventId
venueSeatId

holdReservationId
holdExpiresAt
soldAt
```

Constraint:

```text
UNIQUE(eventId, venueSeatId)
```

### Materialização

Quando um Event SEATED é publicado, seu inventário é materializado a partir dos VenueSeats aplicáveis.

Isso cria uma fotografia transacional do inventário daquela ocorrência.

### Identificador utilizado pelo frontend

O frontend utiliza:

```text
EventSeat.id
```

como identificador transacional.

Não deve enviar somente:

- label;
- row/number;
- VenueSeat.id.

Exemplo de resposta:

```json
{
  "id": "event-seat-id",
  "label": "B12",
  "row": "B",
  "number": 12,
  "x": 12,
  "y": 2,
  "status": "AVAILABLE"
}
```

---

## 14. Estado temporal do EventSeat

Não é necessário persistir um enum:

```text
AVAILABLE
HELD
SOLD
```

O estado é derivado.

### SOLD

```text
soldAt != null
```

### HELD

```text
soldAt == null
AND holdExpiresAt > now
```

### AVAILABLE

Todo outro caso.

`holdExpiresAt` duplica semanticamente `Reservation.expiresAt`.

Essa denormalização é intencional para permitir queries condicionais eficientes sobre o inventário.

Os dois timestamps devem ser escritos de forma consistente dentro da mesma operação transacional.

---

## 15. Reservation

`Reservation` representa uma alocação temporária de inventário para um CUSTOMER.

Campos relevantes:

```text
id
customerId
eventId
expiresAt
confirmedAt
cancelledAt
createdAt
updatedAt
```

### Estado derivado

Não é necessário persistir um enum operacional de estado.

#### ACTIVE

```text
confirmedAt == null
cancelledAt == null
expiresAt > now
```

#### CONFIRMED

```text
confirmedAt != null
cancelledAt == null
```

#### CANCELLED

```text
cancelledAt != null
```

#### EXPIRED

```text
confirmedAt == null
cancelledAt == null
expiresAt <= now
```

---

## 16. Reserva ativa por CUSTOMER/Event

A experiência normal trabalha com no máximo uma Reservation ACTIVE por CUSTOMER/Event.

Essa é uma política de UX e fluxo, não uma invariante crítica de inventário na V1.

O backend pode:

1. procurar Reservation ACTIVE existente;
2. devolver informação suficiente para o frontend apresentar a retomada;
3. permitir cancelamento explícito antes de uma nova tentativa.

Não será introduzido:

- advisory lock por customer/event;
- lock artificial de usuário;
- infraestrutura adicional apenas para impedir uma corrida extremamente rara entre duas requests simultâneas do mesmo CUSTOMER.

Mesmo que essa corrida aconteça, a proteção real do inventário permanece forte.

Assentos não podem ser double sold e capacidade GA não pode ser ultrapassada.

---

## 17. ReservationItem

Cada unidade comercializada gera um `ReservationItem`.

Campos:

```text
id
reservationId
eventSeatId?
unitPriceCents
```

### SEATED

```text
B12 → ReservationItem
B13 → ReservationItem
```

### GENERAL_ADMISSION

Quantidade 3:

```text
ReservationItem
ReservationItem
ReservationItem
```

`eventSeatId` é nulo em GA.

### Price snapshot

`unitPriceCents` registra o preço aplicado naquela compra.

O frontend nunca é fonte confiável do preço.

O backend obtém o valor atual do Event durante a criação da Reservation e grava o snapshot.

Alterações posteriores em `Event.priceCents` não afetam Reservations existentes.

---

## 18. Concorrência — SEATED

A aquisição de assentos deve utilizar operação condicional atômica dentro de transaction.

Conceitualmente:

```text
UPDATE event_seats
SET
    hold_reservation_id = :reservationId,
    hold_expires_at = :expiresAt
WHERE
    id IN (...)
    AND sold_at IS NULL
    AND (
        hold_reservation_id IS NULL
        OR hold_expires_at <= now()
    )
```

A implementação pode variar conforme TypeORM/PostgreSQL, mas deve preservar a propriedade.

Após a operação:

```text
affected rows == requested seat count
```

Se não for:

```text
rollback
→ HTTP 409
```

Uma Reservation nunca deve ser criada parcialmente com apenas parte dos assentos solicitados.

---

## 19. Expiração de holds

A correção do inventário não depende de scheduler.

Se:

```text
holdExpiresAt <= now
```

o assento é considerado disponível para uma nova aquisição.

Não é obrigatório executar uma rotina exatamente no instante de expiração para limpar a linha.

Limpeza posterior pode ocorrer como otimização, não como requisito para correção.

---

## 20. Concorrência — GENERAL_ADMISSION

A V1 não cria unidades anônimas de inventário para GA.

Não existe:

```text
InventoryUnit #1
InventoryUnit #2
InventoryUnit #3
...
```

A disponibilidade é agregada.

Durante criação da Reservation:

1. iniciar transaction;
2. bloquear a linha relevante do Event ou registro equivalente;
3. calcular quantidade mantida por Reservations ACTIVE;
4. calcular quantidade CONFIRMED;
5. verificar capacidade disponível;
6. criar Reservation;
7. criar N ReservationItems;
8. commit.

Esse lock serializa a disputa pela última capacidade.

Invariante:

```text
activeHeldQuantity + confirmedQuantity <= Event.capacity
```

---

## 21. Estratégia de reserva

A V1 não introduz inicialmente uma hierarquia Strategy genérica.

São aceitáveis serviços explícitos:

```text
SeatReservationService
GeneralAdmissionReservationService
```

e um dispatch simples por:

```text
event.admissionMode
```

Se futuramente surgirem setores, novas modalidades ou regras compartilhadas suficientes, a abstração pode ser reavaliada.

---

## 22. Payment

`Payment` representa uma tentativa de pagamento.

Uma Reservation pode possuir múltiplas tentativas históricas.

```text
Reservation 1:N Payment
```

Campos conceituais:

```text
id
reservationId
method
status
idempotencyKey

createdAt
approvedAt?
failedAt?

simulationCompletionAt?
```

### Estados

```text
PENDING
APPROVED
DECLINED
FAILED
```

### Métodos

Inicialmente:

```text
CARD
```

`PIX` deve ser introduzido somente quando a funcionalidade for implementada.

---

## 23. PaymentGateway

O domínio utiliza um port:

```ts
interface PaymentGateway {
  process(...): Promise<PaymentGatewayResult>;
}
```

A V1 fornece:

```text
FakePaymentGateway
```

O comportamento do cartão é determinístico para facilitar demonstração e testes.

Exemplo conceitual:

```text
cartão A → APPROVED
cartão B → DECLINED
```

Não existe comunicação com adquirente real.

---

## 24. Idempotência de pagamento

Cada tentativa de pagamento recebe uma `idempotencyKey`.

A key é gerada quando a tentativa começa.

Ela não deve ser regenerada em cada clique ou retry técnico.

Constraint conceitual:

```text
UNIQUE(reservationId, idempotencyKey)
```

### Mesma key

Se o cliente repetir a request com a mesma key:

- retornar o Payment já persistido;
- não chamar o gateway novamente.

### Nova key

Uma nova key só representa uma nova tentativa intencional quando a anterior já está em estado terminal:

```text
DECLINED
FAILED
```

---

## 25. Exclusividade de pagamento ativo

Uma Reservation pode possuir histórico de Payments, mas não pode existir mais de um pagamento ativo/aprovado concorrente.

Invariante:

```text
no máximo um Payment PENDING ou APPROVED por Reservation
```

Essa regra deve possuir proteção no banco, por exemplo através de índice/constraint parcial apropriada para PostgreSQL.

Consequências:

### Já existe PENDING

Outra tentativa com key diferente recebe erro sem novo gateway call:

```text
PAYMENT_IN_PROGRESS
```

### Já existe APPROVED

Nova tentativa recebe:

```text
RESERVATION_ALREADY_PAID
```

Uma nova idempotency key não pode ser usada para escapar dessa regra.

---

## 26. Lifecycle do pagamento com cartão

A chamada ao gateway não ocorre dentro de uma transaction longa.

### Transaction 1

```text
validar Reservation
verificar que continua ACTIVE
verificar ausência de Payment ativo
criar Payment PENDING
commit
```

### Gateway

```text
FakePaymentGateway.process(...)
```

### Transaction 2

Reabrir estado autoritativo e finalizar.

#### APPROVED

```text
revalidar Reservation
marcar Payment APPROVED
confirmar Reservation
consolidar inventário
criar Tickets
commit
```

#### DECLINED

```text
marcar Payment DECLINED
commit
```

#### erro técnico conhecido

```text
marcar Payment FAILED
commit
```

---

## 27. Payment PENDING órfão

Como não existe transaction aberta durante o gateway call, é possível ocorrer falha de processo após persistir `PENDING`.

Para cartão, um PENDING não deve permanecer bloqueando a Reservation indefinidamente.

Após uma janela técnica superior ao tempo esperado da simulação, um Payment CARD ainda PENDING pode ser tratado como órfão.

A aplicação pode então:

```text
PENDING → FAILED
```

antes de permitir nova tentativa.

Isso deve ocorrer de forma controlada no backend.

Não é necessário introduzir job queue apenas para esse caso na V1.

---

## 28. PIX simulado

Quando implementado, PIX reutiliza a entidade Payment.

```text
method = PIX
status = PENDING
```

A diferença é que PENDING é esperado durante alguns segundos.

A aplicação persiste um instante de conclusão simulada, por exemplo:

```text
simulationCompletionAt
```

Não utilizar:

```ts
setTimeout(() => approve(), 15000);
```

como fonte de verdade.

Após reload ou restart, o backend pode verificar:

```text
now >= simulationCompletionAt
```

e realizar o settlement.

Antes de aprovar:

- revalidar Reservation;
- verificar se ainda pode ser confirmada;
- aplicar as mesmas invariantes de pagamento.

O frontend pode utilizar polling temporário via TanStack Query enquanto o Payment estiver PENDING.

WebSocket não é necessário para PIX na V1.

---

## 29. Confirmação de Reservation

Uma Reservation só é confirmada após pagamento APPROVED.

Durante a transaction de finalização:

### SEATED

Para cada EventSeat da Reservation:

```text
holdReservationId deve corresponder à Reservation
soldAt = now
```

O hold se torna venda.

### GENERAL_ADMISSION

Os ReservationItems passam a compor capacidade confirmada.

### Reservation

```text
confirmedAt = now
```

### Tickets

É criado exatamente um Ticket por ReservationItem.

---

## 30. Ticket

`Ticket` é uma entidade genérica.

Campos conceituais:

```text
id
reservationItemId
publicId

manualCode

issuedAt
checkedInAt?
checkedInByUserId?
cancelledAt?
```

Constraint:

```text
UNIQUE(reservationItemId)
```

Outras constraints relevantes:

```text
UNIQUE(publicId)
UNIQUE(manualCode)
```

Não existem subclasses:

```text
MovieTicket
ShowTicket
SeatTicket
GeneralAdmissionTicket
```

O tipo de Event e o ReservationItem fornecem o contexto necessário.

---

## 31. Credencial QR

O Ticket utiliza um identificador público aleatório e não sequencial.

Exemplo de credencial:

```text
v1.<publicId>.<signature>
```

A assinatura utiliza HMAC com secret do servidor.

Conceitualmente:

```text
signature = HMAC(secret, version + publicId)
```

### Motivos

- não depender de IDs incrementais;
- impedir fabricação trivial de Tickets;
- manter token curto;
- permitir lookup do estado atual no banco;
- evitar usar JWT quando a consulta ao banco já é necessária.

A credencial completa não precisa ser persistida.

Ela pode ser reconstruída a partir de:

- version;
- publicId;
- secret.

### Rotação de secret

Rotação de chave que preserve tokens antigos não faz parte da V1.

Uma rotação simples invalidaria credenciais anteriores.

Isso deve ser documentado como consideration de produção.

---

## 32. Código manual

Cada Ticket possui um código manual aleatório.

Formato:

```text
XXXX-XXXX
```

Exemplo:

```text
7K4P-M9Q2
```

O alfabeto pode evitar:

```text
O
0
I
1
L
```

para reduzir erros de leitura.

O backend pode normalizar:

- caixa;
- hífen;
- espaços.

QR e código manual convergem para o mesmo fluxo de check-in.

---

## 33. Compartilhamento de Ticket

O link compartilhável carrega uma credencial individual do Ticket.

Ele funciona como bearer capability.

Quem possui o link consegue apresentar aquele Ticket.

O backend sempre consulta o estado atual.

Consequentemente:

- Ticket usado continua aparecendo como usado;
- Ticket cancelado continua aparecendo como cancelado.

Não transformar um Ticket inválido em `404` apenas para esconder seu estado.

### Segurança

Em produção real, esse tipo de link exigiria atenção a:

- HTTPS;
- logs;
- analytics;
- referrer leakage;
- exposição em sistemas terceiros.

A V1 utiliza alta entropia e assinatura HMAC como proteção principal.

---

## 34. Check-in

Não existe entidade `CheckIn` separada na V1.

O estado de entrada fica no próprio Ticket:

```text
checkedInAt
checkedInByUserId
```

Isso é suficiente para:

- saber se foi utilizado;
- saber quando;
- saber qual operador realizou a validação.

Uma entidade de tentativas/auditoria poderá ser adicionada futuramente caso exista requisito.

---

## 35. Contexto ativo da portaria

O usuário GATE não possui vínculo permanente com um Event.

Após autenticação:

1. consulta Events disponíveis para operação;
2. seleciona um Event;
3. frontend mantém `activeEventId` como contexto operacional;
4. cada validação envia ou deriva esse Event esperado.

A interface pode exibir:

```text
event.title
venue.name
room/seat layout context quando aplicável
event local time
```

Exemplo:

```text
Duna: Parte Dois
Cine Imperial · Sala A
20:30
```

Trocar de Event altera o contexto da portaria.

Não existe fechamento automático por tempo da operação da portaria na V1. Um Event permanece
operável enquanto seu status for `PUBLISHED`, sem teto temporal derivado de `startsAt`. As fontes
de catálogo não garantem duração ou horário de término consistente, e heurísticas fixas falham em
filmes longos, shows que passam da meia-noite e Events de vários dias. O fechamento futuro será
uma ação manual do organizador, não uma inferência sobre os dados disponíveis.

---

## 36. Resultado do check-in

O use case de validação retorna um resultado semântico.

```text
VALID
INVALID
ALREADY_USED
EVENT_MISMATCH
CANCELLED
```

### INVALID

Inclui situações como:

- token malformado;
- assinatura inválida;
- publicId inexistente;
- código manual inexistente.

### EVENT_MISMATCH

A credencial é válida e o Ticket existe, mas:

```text
ticket.eventId != activeEventId
```

### CANCELLED

Ticket existe, mas:

```text
cancelledAt != null
```

### ALREADY_USED

Ticket existe e:

```text
checkedInAt != null
```

---

## 37. Atomicidade do check-in

Não utilizar:

```text
GET Ticket
if !checkedInAt
  UPDATE Ticket
```

como garantia de uso único.

A operação deve ser condicional e atômica.

Conceitualmente:

```text
UPDATE tickets
SET
    checked_in_at = now(),
    checked_in_by_user_id = :gateUserId
WHERE
    id = :ticketId
    AND checked_in_at IS NULL
    AND cancelled_at IS NULL
```

O resultado da operação determina quem conseguiu validar.

Duas requests concorrentes sobre o mesmo Ticket devem produzir:

```text
1 × VALID
1 × ALREADY_USED
```

e nunca dois `VALID`.

---

## 38. Cancelamento pelo CUSTOMER

A elegibilidade é calculada no backend.

Condições principais:

```text
Reservation CONFIRMED
Event ainda não iniciado
nenhum Ticket utilizado
Reservation ainda não cancelada
dentro da janela definida
```

Conceitualmente:

```text
eligibleUntil =
  min(
    paymentApprovedAt + 7 days,
    event.startsAt
  )
```

O cancelamento é integral por Reservation.

---

## 39. Refund

Refund é uma entidade separada de Payment.

Relação:

```text
Payment 1:N Refund
```

Mesmo que a V1 use apenas um refund integral, o modelo não altera retroativamente a história do Payment.

Payment permanece:

```text
APPROVED
```

Refund registra a devolução posterior.

Estados possíveis:

```text
PENDING
COMPLETED
FAILED
```

A V1 pode concluir o refund imediatamente através de serviço simulado.

Devem existir proteções para impedir refund duplicado da mesma operação.

---

## 40. Cancelamento confirmado

Dentro de transaction:

```text
validar elegibilidade
marcar Reservation cancelada
cancelar Tickets
retornar inventário
criar/completar Refund
commit
```

### SEATED

```text
soldAt = null
holdReservationId = null
holdExpiresAt = null
```

para os EventSeats correspondentes.

### GENERAL_ADMISSION

Os itens cancelados deixam de compor a capacidade ocupada e retornam à disponibilidade para venda.

Tickets continuam persistidos historicamente com:

```text
cancelledAt != null
```

---

## 41. Cancelamento de Event

ORGANIZER pode cancelar Event antes de `startsAt`.

O fluxo deve:

- marcar Event como CANCELLED;
- impedir novas Reservations;
- cancelar Reservations ACTIVE;
- cancelar Reservations confirmadas e seus Tickets emitidos;
- gerar full refund para compras confirmadas quando houver valor pago.

Para a escala da demonstração, esse processamento pode ocorrer de forma síncrona em batch.

### Consideration de produção

Em um Event com dezenas de milhares de Tickets, esse processo deveria utilizar:

- jobs assíncronos;
- batches;
- retries;
- idempotência por etapa;
- monitoramento.

Essa limitação é documentada como consideração de escalabilidade, não como bug da V1.

---

## 42. Edição de Event

Os dados estruturais de um Event são imutáveis após sua criação. A V1 não altera nem reconstrói Venue, `startsAt`, layout, `admissionMode` ou capacidade de uma ocorrência.

O único dado comercial editável é `priceCents`. A alteração afeta apenas novas Reservations graças ao snapshot em `ReservationItem.unitPriceCents`.

`priceCents` aceita `0` para eventos gratuitos e rejeita valores negativos. Um máximo alto protege a API contra payloads absurdos, não contra preços legítimos.

No dashboard do organizador, “Ingressos vendidos” inclui Tickets válidos e cancelados. No card de cada Event, a capacidade é exibida como `disponíveis/total`: somente compras confirmadas ainda não canceladas ocupam inventário. “Eventos ativos” inclui todas as ocorrências publicadas cujo início ainda não chegou, inclusive gratuitas ou sem vendas. “Receita total” representa a receita efetiva: o valor das compras confirmadas menos os reembolsos concluídos.

---

## 43. CatalogProvider

`CatalogItem` é um DTO normalizado e transitório.

Ele não precisa ser uma entidade persistida.

Exemplo:

```ts
type CatalogItem = {
  provider: "TMDB" | "TICKETMASTER";
  externalId: string;
  kind: "MOVIE" | "SHOW";
  title: string;
  description?: string;
  imageUrl?: string;
  genres: string[];
};
```

O Event persiste o snapshot necessário.

---

## 44. TMDb

TMDb é utilizada exclusivamente como catálogo de filmes.

O adapter converte a resposta externa em `CatalogItem`.

A camada restante da aplicação não deve depender diretamente do formato da API da TMDb.

Não consumir da TMDb:

- inventário;
- sessões;
- preço;
- disponibilidade.

---

## 45. Ticketmaster

Ticketmaster Discovery é utilizada como catálogo de atrações/shows.

Preferir o conceito de Attraction/conteúdo quando adequado, em vez de tratar eventos externos da Ticketmaster como inventário local.

A plataforma não sincroniza:

- tickets;
- mapa de assentos;
- capacidade;
- disponibilidade.

O Event local possui sua própria operação comercial.

---

## 46. Genres

Gêneros são metadata do Event.

Podem ser armazenados de forma normalizada suficiente para:

- exibição;
- busca;
- filtros.

Eles não determinam:

- AdmissionMode;
- inventário;
- preço;
- pagamento;
- Ticket;
- check-in.

---

## 47. Realtime

Realtime é implementado com Socket.IO.

PostgreSQL e HTTP permanecem responsáveis pela operação transacional.

Socket.IO atua como projeção de UX.

Eventos previstos:

```text
seat.held
seat.sold
seat.released
```

Eles são emitidos somente depois da confirmação da alteração correspondente no banco.

---

## 48. Realtime e transactions

Não emitir atualização definitiva antes de commit.

Fluxo:

```text
transaction
→ commit
→ realtimeGateway.emit(...)
```

Se a transaction falhar:

```text
nenhum evento de sucesso deve ser emitido
```

A V1 não exige transactional outbox.

Isso é aceitável porque WebSocket não é fonte de verdade.

---

## 49. Reconnect

Socket.IO fornece reconnect automático.

Após conexão ou reconexão:

1. cliente entra novamente na room do Event;
2. cliente executa novo GET do seat map;
3. TanStack Query substitui/reconcilia o cache.

Não é necessário implementar:

- replay de eventos;
- sequence numbers;
- Kafka;
- durable subscriptions.

Mensagem perdida é corrigida pelo refetch.

---

## 50. Expiração e realtime

Expiração de hold é temporal.

A correção não exige emissão exatamente no momento de `expiresAt`.

Clientes podem:

- conhecer `holdExpiresAt`;
- invalidar/refetch dados quando apropriado;
- receber atualização posterior durante outra operação.

Não será implementado scheduler apenas para produzir `seat.released` no milissegundo da expiração.

---

## 51. Frontend state

### TanStack Query

Responsável por estado vindo do servidor:

- Events;
- Event detail;
- seat map;
- active Reservation;
- Payments;
- Tickets;
- organizer events.

Mutations também passam por TanStack Query.

### React local state

Utilizado para:

- assentos selecionados antes do hold;
- campos de formulário;
- modal aberto;
- countdown derivado;
- estado local transitório.

Não introduzir inicialmente:

- Redux;
- Zustand;
- MobX.

Se um problema concreto de estado global aparecer, a decisão pode ser revista.

---

## 52. WebSocket + TanStack Query

Para deltas simples:

```text
seat.held
seat.sold
seat.released
```

o frontend pode atualizar o cache com:

```text
queryClient.setQueryData(...)
```

Após reconnect:

```text
invalidate/refetch
```

O cache local nunca deve ser usado para decidir autoritativamente se uma Reservation pode ser criada.

---

## 53. Checkout e countdown

O frontend recebe:

```text
Reservation.expiresAt
```

A contagem é derivada desse timestamp.

O relógio visual não é fonte de verdade.

Mesmo que a interface ainda exiba alguns segundos incorretos devido a clock skew ou atraso de rede, o endpoint de pagamento deve rejeitar Reservation expirada.

---

## 54. UI de pagamento

Além das garantias do backend, o frontend deve aplicar proteções de UX.

Exemplo:

- guard síncrono contra múltiplos submits;
- botão desabilitado durante mutation;
- reaproveitamento da mesma idempotency key durante retry técnico daquela tentativa.

Isso reduz chamadas duplicadas, mas não substitui as constraints do backend.

---

## 55. Tratamento de erro

Erros de domínio importantes devem possuir respostas distinguíveis.

Exemplos:

```text
SEAT_UNAVAILABLE
RESERVATION_EXPIRED
ACTIVE_RESERVATION_EXISTS
PAYMENT_IN_PROGRESS
RESERVATION_ALREADY_PAID
EVENT_ALREADY_STARTED
TICKET_ALREADY_USED
EVENT_MISMATCH
CANCELLATION_NOT_ALLOWED
```

Não é necessário criar uma taxonomia universal ou framework genérico de erros antecipadamente.

O objetivo é permitir UX clara para casos relevantes.

---

## 56. DTOs

DTOs de entrada HTTP no NestJS são classes com runtime validation.

Exemplo:

```ts
class CreateReservationDto {
  ...
}
```

Tipos exclusivamente internos podem permanecer:

- interfaces;
- type aliases.

Não é necessário transformar todos os objetos internos em classes DTO.

---

## 57. Compartilhamento de tipos com frontend

Não será criado um package compartilhado apenas para evitar repetição de alguns tipos.

Frontend e backend podem inicialmente possuir seus próprios contratos TypeScript.

Um package compartilhado poderá ser introduzido caso exista repetição significativa ou geração contratual que justifique a complexidade.

---

## 58. Event bus

A V1 não introduz event bus interno.

Exemplo de fluxo aceitável:

```text
ReservationService
→ transaction
→ commit
→ RealtimeGateway
```

ou colaboração equivalente entre módulos.

Um event bus passa a fazer sentido se surgirem consumidores independentes como:

- analytics;
- audit log;
- notifications;
- webhooks;
- integrações assíncronas.

---

## 59. CQRS

CQRS não faz parte da arquitetura inicial.

Commands/queries explícitos do Nest podem ser introduzidos apenas se melhorarem concretamente organização de determinado módulo.

Não usar CQRS como padrão obrigatório para todas as operações.

---

## 60. Microservices

A aplicação não utiliza microservices na V1.

Não existe necessidade atual de separar:

```text
payment-service
ticket-service
reservation-service
catalog-service
```

Um modular monolith mantém:

- transações simples;
- deploy simples;
- debugging simples;
- consistência forte;
- menor overhead operacional.

---

## 61. Redis

Redis não é requisito da V1.

PostgreSQL é suficiente para:

- inventory;
- locks;
- idempotency;
- tickets;
- payment state;
- reservations.

Socket.IO pode operar em uma instância de API na demonstração.

Redis adapter ou distributed locks só seriam necessários em uma evolução de escala/topologia.

---

## 62. Jobs e scheduler

A V1 não depende de scheduler para:

- expirar Reservation;
- liberar hold;
- determinar disponibilidade.

Estados temporais são derivados de timestamps.

Jobs futuros podem ser úteis para:

- cleanup;
- notificações;
- refund em massa;
- reconciliação;
- analytics.

Nenhum deles é necessário para a correção central da V1.

---

## 63. Testes

A estratégia de testes é orientada a risco.

Não existe meta de cobertura por percentual como objetivo primário.

As invariantes críticas devem possuir testes automatizados.

### Concorrência SEATED

Duas requests simultâneas para o mesmo assento:

```text
1 sucesso
1 conflito
```

### Capacidade GA

Duas requests concorrendo pelas últimas unidades:

```text
capacity nunca ultrapassada
```

### Reservation expirada

```text
não pode ser paga
```

### Pagamento recusado

```text
não cria Ticket
```

### Pagamento aprovado

```text
1 ReservationItem → exatamente 1 Ticket
```

### Payment retry

```text
mesma idempotency key
→ mesmo Payment
→ gateway não chamado novamente
```

### Pagamento concorrente

```text
no máximo um PENDING/APPROVED
```

### Ticket inválido

Credencial HMAC inválida:

```text
INVALID
```

### Double check-in

Duas validações concorrentes:

```text
1 VALID
1 ALREADY_USED
```

### Event errado

```text
EVENT_MISMATCH
```

### Ticket cancelado

```text
CANCELLED
```

### Cancelamento

Compra elegível:

```text
refund
+ ticket cancellation
+ stock return
```

Compra com Ticket utilizado:

```text
cancelamento rejeitado
```

---

## 64. Tipo dos testes

A maior parte das invariantes de banco deve ser coberta por integration tests utilizando PostgreSQL real.

Testes concorrentes podem disparar requests/promises simultaneamente.

Exemplo conceitual:

```ts
await Promise.allSettled([reserveSameSeat(), reserveSameSeat()]);
```

Mocks isolados não comprovam comportamento de:

- locks;
- constraints;
- conditional update;
- transaction isolation.

Testes unitários continuam úteis para regras puras.

Playwright pode ser utilizado para algumas jornadas demonstráveis, mas não precisa cobrir toda a aplicação.

---

## 65. Seeds

Seeds devem incluir no mínimo:

- 1 ORGANIZER;
- 2 CUSTOMER;
- 1 GATE;
- Venue;
- layout seated;
- pelo menos 1 Event.

A entrega planejada pode incluir:

- filme SEATED;
- show GENERAL_ADMISSION;
- dados que facilitem demonstrar fluxo aprovado e recusado.

Seeds não devem contornar regras de domínio.

---

## 66. Docker Compose

A stack local deve permitir executar os componentes necessários com baixa fricção.

Conceitualmente:

```text
docker compose
├── web
├── api
└── postgres
```

A documentação deve explicar:

- env setup;
- migrations;
- seeds;
- credenciais de demonstração;
- URLs locais.

---

## 67. Deploy

Deploy público faz parte da entrega planejada.

A V1 pode utilizar providers independentes para:

- frontend;
- API;
- PostgreSQL.

Não existe exigência de domínio próprio.

A arquitetura não deve depender de infraestrutura paga específica.

Antes da entrega pública devem ser verificados:

- CORS;
- cookies;
- HTTPS;
- variáveis secretas;
- migrations;
- seed/demo data;
- configuração das APIs externas;
- comportamento cross-site;
- CSRF conforme topologia final.

---

## 68. Observabilidade

Não será construída uma stack dedicada de observabilidade.

Logs estruturados suficientes para desenvolvimento e demonstração são aceitáveis.

Não fazem parte da V1:

- OpenTelemetry completo;
- distributed tracing;
- ELK;
- Prometheus/Grafana;
- APM dedicado.

Erros relevantes devem possuir logging suficiente para debugging.

---

## 69. Segurança

A V1 deve aplicar práticas proporcionais ao challenge.

Incluem:

- password hashing;
- secrets fora do repositório;
- JWT em HttpOnly cookie;
- autorização server-side;
- HMAC para credenciais de Ticket;
- identificadores públicos de alta entropia;
- validação de entrada;
- queries parametrizadas via ORM/QueryBuilder;
- HTTPS em produção;
- não confiar em preço enviado pelo frontend.

### Gate manual code

O endpoint de código manual é autenticado como GATE.

Rate limiting simples pode ser aplicado se for conveniente.

Não será construída infraestrutura antifraude avançada.

---

## 70. Dados financeiros

Nenhum dado de cartão representa pagamento real.

A aplicação não deve persistir CVV.

Os campos do formulário servem exclusivamente para a simulação.

Logs não devem registrar valores sensíveis desnecessariamente.

---

## 71. Documentação técnica

O repositório deve possuir documentação suficiente para explicar não apenas o que foi construído, mas as decisões relevantes.

Estrutura prevista:

```text
README.md
AGENTS.md

docs/
├── product-scope.md
├── application-scope.md
├── architecture.md
├── technical-decisions.md
├── ai-usage.md
└── adr/
```

---

## 72. AGENTS.md

`AGENTS.md` deve fornecer contexto conciso para desenvolvimento assistido por IA.

Pode conter:

- objetivo do produto;
- escopo da V1;
- non-goals;
- invariantes críticas;
- arquitetura;
- limites entre módulos;
- regras de implementação.

Exemplos de princípios:

```text
PostgreSQL guarantees critical invariants.

Do not add an abstraction without a concrete current need.

Realtime is UX, not transaction authority.

Tests should target risk, not line coverage.

External catalogs provide content, not inventory.
```

O arquivo não deve duplicar integralmente toda a documentação.

---

## 73. ADRs e technical decisions

Decisões relevantes devem ser registradas quando houver tradeoff real.

Exemplos:

- NestJS vs backend minimalista;
- TypeORM vs Drizzle;
- modular monolith;
- external providers como catálogo;
- EventCategory separado de AdmissionMode;
- ausência de EventSector;
- Event como ocorrência única;
- PostgreSQL como autoridade;
- estados temporais derivados;
- EventSeat materializado;
- GA agregado;
- ReservationItem com price snapshot;
- Ticket genérico;
- HMAC vs JWT para Ticket;
- WebSocket como projeção;
- ausência de event bus;
- payment idempotency;
- Payment PENDING antes do gateway;
- Refund separado de Payment;
- cancelamento síncrono em batch na V1.

Não é necessário criar ADR para cada pequena escolha de implementação.

---

## 74. AI usage

O desafio deve documentar o uso de IA.

A documentação deve explicar:

- quais ferramentas foram utilizadas;
- para quais tipos de atividade;
- quais artefatos foram produzidos;
- quais decisões foram revisadas pelo desenvolvedor;
- exemplos relevantes de sugestões rejeitadas;
- partes feitas sem IA quando aplicável.

Não deve ser feito dump bruto de todas as conversas.

O objetivo é demonstrar processo e julgamento.

---

## 75. Non-goals técnicos

Não fazem parte da V1:

- microservices;
- distributed transactions;
- Redis obrigatório;
- Kafka/RabbitMQ;
- transactional outbox;
- CQRS obrigatório;
- event sourcing;
- generic repository framework;
- generic InventoryUnit;
- EventSector;
- generic idempotency infrastructure para todas as mutations;
- refresh token;
- OAuth;
- offline-first;
- service worker de portaria offline;
- scheduler crítico para holds;
- queue crítica para pagamentos;
- integração financeira real;
- arquitetura multi-region;
- horizontal scaling de Socket.IO;
- editor avançado de Venue/layout;
- shared package obrigatório;
- full design system package;
- analytics avançado.

---

## 76. Production considerations

Algumas escolhas são conscientemente adequadas para a V1, mas exigiriam evolução em produção real.

### Cancelamento em massa

V1:

```text
processamento síncrono
```

Produção:

```text
queue
batch
retry
idempotency
monitoring
```

### Socket.IO

V1:

```text
uma instância de API é suficiente
```

Escala horizontal:

```text
adapter distribuído
```

### HMAC secret rotation

V1:

```text
um secret ativo
```

Produção:

```text
key versioning
rotation
old-key verification window
```

### PIX

V1:

```text
settlement temporal simulado
```

Produção:

```text
provider
webhook
reconciliation
```

### Payments

V1:

```text
FakePaymentGateway
```

Produção:

```text
PCI-aware provider integration
webhooks
reconciliation
fraud controls
```

### Gate

V1:

```text
online
```

Produção de grande evento:

```text
offline tolerance
sync/reconciliation
device management
```

### Cookies e CSRF

V1:

```text
configuração revisada para o deploy escolhido
```

Produção:

```text
política explicitamente desenhada para a topologia e ameaças reais
```

---

## 77. Invariantes centrais

A implementação deve preservar pelo menos as seguintes propriedades.

### Inventário SEATED

Um EventSeat não pode pertencer simultaneamente a duas Reservations válidas ou vendas.

### Inventário GA

Reservations ACTIVE + vendas confirmadas não podem ultrapassar a capacidade.

### Price snapshot

O valor de uma compra não muda depois da criação da Reservation.

### Payment

Uma Reservation não pode ser confirmada duas vezes por pagamentos concorrentes.

### Ticket

Cada ReservationItem gera no máximo um Ticket.

### QR

Uma credencial fabricada sem o secret não deve ser aceita.

### Check-in

Um Ticket só pode produzir um check-in bem-sucedido uma vez.

### Event context

Um Ticket de outro Event nunca pode ser aceito no contexto ativo da portaria.

### Cancelamento

Ticket cancelado nunca pode produzir entrada válida.

### Fonte de verdade

WebSocket, cache e estado local nunca podem quebrar nenhuma dessas invariantes.

---

## 78. Critério arquitetural da V1

Uma solução é preferível quando consegue:

1. tornar a regra transacional explícita;
2. provar a invariante com teste;
3. manter o fluxo compreensível;
4. evitar coordenação distribuída desnecessária;
5. permitir evolução futura sem implementar antecipadamente essa evolução.

Quando houver escolha entre:

```text
mais abstração
```

e:

```text
uma implementação direta, testável e correta
```

a V1 prefere a segunda.

O objetivo não é demonstrar a maior quantidade possível de padrões arquiteturais.

O objetivo é demonstrar **julgamento técnico, consistência transacional e capacidade de entregar um produto completo**.
