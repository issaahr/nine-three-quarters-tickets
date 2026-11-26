# ADR 0006 — Prazo autoritativo no cancelamento transacional

- Status: aceito
- Data: 2026-11-25

## Contexto

Uma requisição de cancelamento pode começar dentro do prazo e só obter os locks depois de ele vencer. Mesmo após bloquear o Event, as Reservations e os Payments aplicáveis, a transação pode aguardar ao cancelar um Ticket, liberar um EventSeat ou registrar um Refund.

No PostgreSQL, `CURRENT_TIMESTAMP` permanece fixo no início da transação. Uma decisão baseada nesse instante pode aceitar um cancelamento cujo prazo já terminou durante a execução.

## Decisão

O prazo de cancelamento é avaliado com `clock_timestamp()` na mesma transação PostgreSQL, tanto para Events `SEATED` quanto para `GENERAL_ADMISSION`.

- A ordem de locks permanece `Event → Reservation → Payment → Ticket/EventSeat/Refund`. No cancelamento de Event, as Reservations são bloqueadas por identificador em ordem crescente e os Payments ativos das Reservations afetadas são bloqueados antes da primeira leitura do relógio.
- A primeira leitura, após os locks de Event e Reservation e de Payment quando aplicável, rejeita cedo um pedido fora do prazo. O instante lido também é usado nos registros produzidos pelo cancelamento.
- O cancelamento de uma Reservation ainda ativa usa `Reservation.expiresAt` como limite.
- O cancelamento de uma compra confirmada pelo CUSTOMER usa o menor instante entre `Event.startsAt` e sete dias após `Payment.approvedAt`. A atualização condicional dos Tickets continua protegendo a disputa com o check-in.
- O cancelamento de Event pelo ORGANIZER usa `Event.startsAt` como limite.
- A última consulta da transação, após as escritas e antes do commit, lê novamente `clock_timestamp()`. Se o limite foi atingido ou ultrapassado, o erro de domínio provoca o rollback integral e a API retorna `409`.

## Alternativas consideradas

### Uma única leitura do relógio após os primeiros locks

A leitura continuaria válida apenas para aquele ponto da execução. Atualizações de Tickets e EventSeats ou a gravação de Refund ainda poderiam aguardar até depois do prazo.

### Antecipar um lock explícito para cada linha afetada

A checagem final cobre a espera nas operações de escrita com uma única consulta adicional ao PostgreSQL. O cancelamento de Reservation mantém as escritas condicionais que protegem a disputa por Tickets e EventSeats.

## Consequências

- A última leitura do relógio dentro da transação é o instante de decisão do prazo.
- Se o prazo vencer durante a execução, as alterações de Event, Reservation, Payment, Ticket, inventário e Refund feitas pelo cancelamento são revertidas em conjunto.
- A liberação de assentos é publicada em tempo real somente após um commit bem-sucedido.
- Os E2E de regressão usam PostgreSQL e fazem as requisições atravessarem os prazos enquanto aguardam locks.
