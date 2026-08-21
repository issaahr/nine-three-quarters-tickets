# ADR 0004 — Materialização transacional do inventário SEATED

- Status: aceito
- Data: 2026-08-21

## Contexto

Um Event SEATED precisa preservar o layout comercializado mesmo que o Venue seja alterado posteriormente. Criar o inventário durante o DRAFT produziria assentos para ocorrências que talvez nunca fossem publicadas, enquanto criá-lo somente na primeira reserva deixaria a disponibilidade pública sem uma fotografia persistida e tornaria a primeira operação de compra responsável por inicializar o inventário.

A publicação também pode receber requisições concorrentes ou repetidas. Verificações apenas em memória ou uma leitura seguida de escritas fora de uma única transação não impediriam materialização duplicada ou um Event publicado com inventário incompleto.

## Decisão

O inventário de um Event SEATED será materializado durante sua publicação.

- Publicação e criação dos `EventSeat` acontecem na mesma transação PostgreSQL.
- O Event é carregado com lock pessimista antes da transição de estado.
- Cada `VenueSeat` aplicável ao Venue produz um `EventSeat` vinculado ao Event.
- `UNIQUE(eventId, venueSeatId)` impede duplicidade estrutural no banco.
- O Event muda de `DRAFT` para `PUBLISHED` somente depois que todo o inventário é criado.
- Repetir a publicação de um Event já `PUBLISHED` é idempotente e não recria assentos.
- Um Venue sem assentos impede a publicação de um Event SEATED.
- A transação utiliza exclusivamente repositories obtidos do `EntityManager` transacional.

Na V1, todos os `VenueSeat` pertencentes ao Venue são aplicáveis. Um conceito adicional de setor, bloqueio de layout ou filtro genérico de inventário não será introduzido sem uma necessidade de produto explícita.

## Consequências

- Events em `DRAFT` não ocupam inventário comercializável.
- Um Event publicado mantém uma fotografia persistida do layout existente no momento da publicação.
- Falhas durante a materialização revertem também a transição para `PUBLISHED`.
- Publicações concorrentes do mesmo Event são serializadas pelo banco.
- Alterações posteriores no layout do Venue não modificam os `EventSeat` já materializados.
- O fluxo de reservas poderá operar sobre `EventSeat.id` sem reconstruir inventário a partir do Venue.
- A publicação executa uma escrita por assento e seu custo cresce com o tamanho do layout, trade-off aceito para manter a operação atômica e explícita na V1.
