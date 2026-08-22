# ADR 0005 — Aquisição atômica e expiração de holds SEATED

- Status: aceito
- Data: 2026-08-21

## Contexto

Em Events `SEATED`, dois CUSTOMER podem selecionar o mesmo `EventSeat` a partir de mapas momentaneamente idênticos. A seleção no frontend não constitui reserva e a interface pode estar desatualizada. Portanto, uma sequência baseada apenas em consultar disponibilidade e depois gravar o hold permitiria que requisições concorrentes observassem o mesmo estado livre.

Uma solicitação também pode conter vários assentos. Adquirir somente parte deles e manter uma `Reservation` parcial violaria o contrato comercial. Além disso, a validade do hold precisa sobreviver a reload, troca de dispositivo e indisponibilidade de processos auxiliares, sem depender de timers do navegador ou de um scheduler executado exatamente no instante da expiração.

## Decisão

A aquisição de assentos será uma operação condicional e atômica no PostgreSQL.

- A API cria `Reservation`, adquire os `EventSeat` e persiste os `ReservationItem` dentro da mesma transação.
- O instante de criação e o `expiresAt` são derivados de `CURRENT_TIMESTAMP` na conexão transacional e da duração configurada em `RESERVATION_HOLD_DURATION_SECONDS`.
- Um único `UPDATE` condiciona a aquisição a assentos do Event solicitado, não vendidos e sem hold válido no instante da transação.
- A quantidade de linhas afetadas deve corresponder exatamente à quantidade de assentos solicitada. Qualquer divergência gera conflito e reverte Reservation, itens e todos os holds daquela tentativa.
- Cada `ReservationItem` recebe o snapshot de `Event.priceCents`; preço informado pelo cliente não integra o contrato de criação.
- `holdExpiresAt <= CURRENT_TIMESTAMP` torna o assento elegível para outra aquisição, mesmo que a referência histórica do hold ainda esteja persistida. Um scheduler pode limpar dados posteriormente, mas não participa da garantia de disponibilidade.
- O cancelamento explícito bloqueia a `Reservation`, confirma que ela permanece ativa e limpa somente linhas cujo `holdReservationId` ainda corresponde à Reservation cancelada, no mesmo commit.
- O frontend deriva o countdown de `Reservation.expiresAt` somente para UX e consulta novamente a API ao chegar a zero. O relógio do browser não decide validade nem disponibilidade.

A política de no máximo uma Reservation ativa por CUSTOMER/Event permanece uma regra de experiência. Ela não introduz advisory lock, lock artificial de User ou outra serialização que não seja necessária para proteger o inventário.

## Alternativas consideradas

### Read-then-write na aplicação

Rejeitada porque duas transações poderiam ler o mesmo assento como disponível antes de qualquer escrita, permitindo double hold.

### Lock em memória ou coordenação por processo

Rejeitada porque não sobreviveria a múltiplas instâncias, reinícios ou requisições atendidas por processos diferentes e duplicaria uma responsabilidade do PostgreSQL.

### Lock individual prévio de todos os assentos

Não adotado porque o `UPDATE` condicional já expressa a disputa e permite validar atomicamente a quantidade adquirida sem uma fase adicional de leitura. Locks explícitos continuam apropriados para transições de lifecycle da própria Reservation.

### Scheduler obrigatório para expiração

Rejeitado como requisito de correção. A disponibilidade deve ser calculada pelo timestamp persistido mesmo quando nenhuma rotina de limpeza estiver em execução.

### Advisory lock por CUSTOMER/Event

Rejeitado na V1 porque a unicidade de Reservation ativa nesse recorte é uma política de UX, enquanto a invariante crítica de inventário já é preservada pela escrita condicional.

## Consequências

- Duas requisições concorrentes não conseguem manter o mesmo `EventSeat` em holds válidos.
- Uma tentativa com vários assentos é integral: todos são adquiridos ou nenhuma mudança é confirmada.
- Reservations e itens malsucedidos não permanecem persistidos após conflito.
- Holds expirados deixam de bloquear inventário sem exigir execução pontual de infraestrutura auxiliar.
- O histórico pode conservar referências expiradas até uma escrita posterior, sem alterar o estado percebido do assento.
- Cancelamento explícito libera inventário imediatamente e não remove um hold que já tenha sido reatribuído.
- Testes de concorrência, rollback e cancelamento precisam executar contra PostgreSQL real; mocks de repository não comprovam essas propriedades.
- O countdown pode apresentar pequena diferença por clock skew, mas nenhuma operação autoritativa depende dele.
