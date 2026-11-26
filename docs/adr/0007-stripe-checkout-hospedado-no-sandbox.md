# ADR 0007 — Stripe Checkout hospedado no sandbox

- Status: aceito
- Data: 2026-11-26

## Contexto

A [S12](https://github.com/issaahr/nine-three-quarters-tickets/issues/35) integra cartão e Pix em BRL a um sandbox e preserva a demonstração fake. A experiência precisa sobreviver ao retorno do cliente, a timeouts e à entrega irregular de webhooks. A Stripe pode aceitar uma cobrança quando a reserva já perdeu a validade, enquanto o PostgreSQL continua responsável pela compra, pelo inventário e pelos Tickets.

A prova de capacidade confirmou criação idempotente, consulta, webhook, expiração e estorno integral para ambos os métodos. O prazo da sessão Stripe e o prazo do Pix são independentes do hold. [Prova avulsa e validação integrada](../stripe-sandbox-validation.md)

## Decisão

- Selecionar o modo fake ou o Stripe Checkout hospedado por configuração da API. Manter a integração restrita a chaves e objetos de teste. Em desenvolvimento, somente a API recebe as credenciais de `env/api.env`. Cartão e Pix do sandbox são informados diretamente à Stripe.
- Manter método e provedor separados. Persistir o Payment com valor e moeda derivados da reserva e a URL de retorno antes de iniciar I/O. A chave idempotente externa deriva do ID do Payment. Uma repetição deve preservar os parâmetros da tentativa e a serialização usada na criação original. Compras gratuitas são confirmadas localmente.
- Localizar sessões sem vínculo externo pela identidade da tentativa em uma busca paginada na janela de criação. Confirmar a sessão encontrada por consulta direta e validar ambiente, método, valor e moeda. Uma tentativa legada sem URL histórica só permite descoberta. Quando os parâmetros são conhecidos e a chave ainda está dentro da janela segura, uma ação explícita pode repetir a criação com a chave original. Uma busca inconclusiva mantém a tentativa bloqueada para cobranças concorrentes.
- Usar o webhook assinado e a conciliação periódica como entradas para uma consulta autoritativa ao provedor. Aplicar a observação sob locks na ordem Event, Reservation e Payment, com o relógio do PostgreSQL. O retorno da Stripe e o polling do Web consultam o estado da API. O worker usa o estado persistido, trata tentativas com e sem vínculo em lotes independentes e solicita expiração de sessões abertas quando a reserva não é mais elegível.
- Registrar estorno integral em uma intenção `PENDING` ao cancelar uma compra paga ou receber uma cobrança sem compra válida. Executar a intenção e consultar seu resultado fora da transação de compra ou cancelamento. A confirmação externa permite marcar `COMPLETED`. A geração de envio persistida e o identificador local da intenção permitem recuperar respostas perdidas.

### Proteção das rotas

Esta decisão complementa a política do [ADR 0003](0003-autenticacao-jwt-em-cookie-http-only.md). Iniciar, consultar e retomar o checkout hospedado exigem sessão de `CUSTOMER`, propriedade da reserva e `Origin` confiável. A autenticação e a origem são verificadas antes de consumir a quota compartilhada do usuário, para que requisições cross-site rejeitadas não bloqueiem seu checkout.

- `POST /reservations/:reservationId/payments/hosted`
- `GET /reservations/:reservationId/payments/hosted`
- `POST /reservations/:reservationId/payments/hosted/:paymentId/resume`

O webhook `POST /payments/webhooks/stripe` autentica a assinatura da Stripe sobre o corpo bruto e verifica o ambiente de teste. O evento indica a sessão a consultar. O resultado externo e a transição local são revalidados antes do ACK quando a notificação corresponde a uma tentativa da aplicação.

A consulta do checkout e as duas mutações compartilham uma quota por CUSTOMER já autenticado. As três usam a mesma chave de throttle, independentemente da reserva e do proxy. O excesso retorna `429` e o webhook segue sua política de assinatura.

## Alternativas consideradas

- **Formulário personalizado com tokenização.** Permitiria mais controle visual, com mais integração do frontend e responsabilidade sobre a experiência de coleta. O Checkout hospedado atende a ambos os métodos e deixa a entrada de dados financeiros na Stripe.
- **Confirmação pelo retorno do navegador ou somente por webhook.** O navegador pode fechar antes de voltar, e a entrega de webhook pode falhar ou chegar fora de ordem. A API concilia ambos os caminhos a partir do estado atual do provedor.
- **Fila distribuída ou extensão do hold.** O monólito e o PostgreSQL são suficientes para a escala de sandbox. A validade do inventário permanece definida pelos timestamps locais, e os registros persistidos permitem retomar a conciliação após reinício.

## Consequências

- A interface hospedada muda de origem. Nas transições de domínio, a rota de retorno original precisa permanecer acessível para sessões que já foram criadas.
- O aplicativo libera inventário com base no prazo local, mesmo quando o worker está parado. A expiração na Stripe e o estorno podem ser observados depois da liberação local.
- O worker da API só faz progresso enquanto o serviço está ativo. Se o Render Free hibernar, a conciliação retoma do estado persistido quando a API volta. [Limites do Render Free](https://render.com/docs/free#spinning-down-on-idle)
- Uma falha ambígua sem sessão encontrada permanece pendente. A ausência de correspondência na listagem ou o encurtamento da janela idempotente não autoriza uma nova cobrança.
- Os testes automatizados usam PostgreSQL e respostas controladas do provedor. A validação manual no sandbox cobre os dois métodos. Credenciais e cobranças em produção, boleto, múltiplos provedores, estorno parcial e infraestrutura distribuída permanecem fora da S12.
