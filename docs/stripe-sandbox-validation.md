# Validação do Stripe Checkout no sandbox

A [S12](https://github.com/issaahr/nine-three-quarters-tickets/issues/35) usa o Stripe Checkout hospedado para cartão e Pix em BRL. O modo Stripe usa chaves e objetos de teste. O modo fake permanece disponível para a demonstração local.

## Preparar o ambiente

1. Configure os arquivos de `env/` e inicie PostgreSQL, API e Web conforme [Como executar](../README.md#como-executar). Para os detalhes de conexão com banco externo, consulte [TLS do PostgreSQL](../README.md#tls-do-postgresql).
2. Siga [Stripe no README](../README.md#stripe) para selecionar o sandbox, habilitar cartão e Pix, obter as duas credenciais e iniciar o listener local. Mantenha a CLI no mesmo sandbox da API e o terminal do listener aberto durante a validação dos webhooks.
3. Abra o Web na origem configurada em `CORS_ORIGINS`. Para conferir o ambiente ativo, consulte `GET /payments/configuration` autenticado como `CUSTOMER`: o modo deve ser `HOSTED`, com cartão e Pix disponíveis.
4. Crie eventos com preço positivo em BRL nas modalidades de assentos numerados e entrada geral, ou utilize a [seed de demonstração](../README.md#dados-locais-e-testes). Separe uma conta `CUSTOMER` para comprar e uma conta `ORGANIZER` para cancelar um evento próprio.

## Reprodução pelo Web

1. **Cartão.** Reserve um assento e escolha **Cartão de crédito** e **Ir para o pagamento**. No checkout da Stripe, use `4242 4242 4242 4242`, validade futura e CVC de teste. Ao voltar à reserva, acompanhe a confirmação e abra **Meus ingressos** para conferir o ingresso emitido. [Cartões de teste](https://docs.stripe.com/testing)
2. **Pix e retomada.** Reserve um ingresso de entrada geral, escolha **Pix** e abra o checkout. Volte à página da reserva pelo botão de retorno da Stripe ou pelo histórico do navegador. Recarregue a página e selecione **Retomar pagamento** para abrir a mesma sessão. Na Stripe, use `succeed_immediately@example.com` para aprovação sintética e, se solicitado, o CPF de teste `000.000.000-00`. Ao retornar, aguarde o estado confirmado pela API. [Pix de teste](https://docs.stripe.com/payments/pix/accept-a-payment?payment-ui=checkout#test-your-integration)
3. **Cancelamento e estorno.** Cancele uma compra confirmada pelo cliente. Em outra compra, cancele o evento pelo painel do organizador. Confira o ingresso cancelado e, na compra de assento numerado cancelada pelo cliente, o assento liberado. Confira no Dashboard do sandbox ou na API da Stripe que existe um único estorno integral com status `succeeded` para cada cobrança. O registro local começa `PENDING` e fica `COMPLETED` após confirmação externa. [Estornos da Stripe](https://docs.stripe.com/api/refunds)
4. **Expiração.** Em uma instância com banco descartável, use `RESERVATION_HOLD_DURATION_SECONDS=120` em `env/api.env` antes de criar uma reserva. Se usar Compose, recrie o serviço da API ao alterar a configuração. Abra o Pix e use `fill_never@example.com` para deixar a cobrança pendente. Aguarde o fim do hold e a próxima conciliação. Confirme que a sessão ficou `expired` e `unpaid`, a tentativa ficou `FAILED` e a reserva ficou sem ingressos ou estorno. O intervalo do worker é de 30 segundos. [Expiração de sessões abertas](https://docs.stripe.com/api/checkout/sessions/expire)
5. **Cobrança tardia sem webhook.** Nessa mesma instância descartável, abra uma nova sessão de cartão enquanto o hold estiver válido. Pare a API e a Stripe CLI, mantendo a sessão hospedada aberta. Depois do fim do hold, conclua o cartão de teste na Stripe. Suba a API com o mesmo banco e mantenha o relay desligado até confirmar a conciliação. Verifique `Payment` em `FAILED`, ausência de ingressos e um estorno integral confirmado. A conciliação e o envio do estorno podem ocorrer em ciclos distintos. Em Compose, `docker compose stop api` e `docker compose start api` preservam o banco entre as duas etapas.

Para controlar a validação da assinatura em um ambiente Stripe já iniciado, envie uma requisição de teste sem `Stripe-Signature`. A API deve retornar HTTP `400`. Use `curl.exe` no PowerShell.

```bash
curl -i -H 'Content-Type: application/json' -d '{}' http://localhost:3000/payments/webhooks/stripe
```

Em caso de falha técnica ao iniciar a sessão, volte à reserva e use **Retomar pagamento** quando a ação estiver disponível. Confira que a retomada preserva o ID da tentativa e a sessão externa. Se receber `429` com `RATE_LIMIT_EXCEEDED`, aguarde o intervalo indicado por `Retry-After-HostedCheckout` antes de tentar novamente.

Para validar os limites do método, use os valores descritos em [PaymentGateway no escopo técnico](application-scope.md#23-paymentgateway). Um total incompatível deve retornar `422` com `PAYMENT_AMOUNT_UNSUPPORTED`, sem criar tentativa. Valide também uma reserva gratuita: a confirmação deve ocorrer localmente, sem criar sessão ou estorno na Stripe.

O mapa dos serviços e os fluxos de retomada, conciliação e estorno estão em [Arquitetura de pagamentos](architecture.md#pagamentos). As opções para voltar ao modo fake estão no [README](../README.md#stripe-checkout-em-sandbox).

## Resultados da integração

Validação executada em 26 de novembro de 2026 com a Web, a API, PostgreSQL 17 e o sandbox da Stripe. As cobranças abaixo foram de teste.

| Cenário                           | Resultado observado                                                                                                                                                                              |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Cartão pelo Web                   | R$ 5,00 aprovados. Reserva de assento numerado confirmada, assento vendido e um Ticket emitido.                                                                                                  |
| Cancelamento pelo cliente         | Ticket cancelado e assento liberado. Um único estorno integral de R$ 5,00 confirmado na Stripe.                                                                                                  |
| Pix pelo Web e retomada           | Voltar à reserva e escolher **Retomar pagamento** abriu a mesma sessão. A aprovação sintética confirmou a reserva de entrada geral e emitiu um Ticket.                                           |
| Cancelamento pelo organizador     | Em outra compra Pix de R$ 5,00, o cancelamento do evento cancelou o Ticket e o estorno integral foi confirmado.                                                                                  |
| Webhook entregue à API            | A Stripe CLI registrou seis respostas HTTP `204` durante o teste integrado. O controle sem assinatura retornou HTTP `400`.                                                                       |
| Pix aberto após o fim do hold     | A sessão ficou `expired` e `unpaid`. A tentativa ficou `FAILED`. Nenhum Ticket ou estorno foi criado.                                                                                            |
| Cartão pago depois do fim do hold | Com API e relay parados no momento do pagamento, o worker conciliou a tentativa como `FAILED` ao reiniciar a API. Um único estorno integral foi confirmado, sem Tickets e sem replay do webhook. |

Na validação inicial da S12 passaram 155 testes unitários da API, 199 E2E com PostgreSQL 17 e 123 testes do Web. A revisão posterior acrescentou testes automatizados de descoberta sem webhook após reinício, paginação de sessões, concorrência em entrada geral, proteção de origem e limites de valor por método.

## Prova avulsa do primeiro commit

Na prova inicial de 26 de novembro de 2026, sessões avulsas de R$ 5,00 foram criadas em um sandbox de uma conta brasileira usando a API `2026-11-18.endive` e a Stripe CLI `1.55.15`. As sessões foram verificadas como `livemode=false`. O receptor HTTP local usado nesta prova era separado da API da aplicação.

| Cenário                         | Resultado observado                                                                                                                                                                                                                                                                                                                                        |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cartão                          | Pagamento concluído no Checkout hospedado com cartão de teste. A API retornou sessão `complete`, `payment_status=paid` e PaymentIntent `succeeded`.                                                                                                                                                                                                        |
| PIX                             | A página hospedada exibiu o QR de teste. O endereço de e-mail de aprovação imediata levou a sessão a `complete`, com `payment_status=paid` e PaymentIntent `succeeded`.                                                                                                                                                                                    |
| Webhooks                        | A Stripe CLI encaminhou eventos das sessões ao receptor local, que verificou a assinatura sobre o corpo bruto. Cartão e PIX produziram `payment_intent.succeeded` e `checkout.session.completed`. A requisição de controle sem assinatura recebeu HTTP `400`. No teste de cartão, o evento de criação do PaymentIntent chegou depois do evento de sucesso. |
| Idempotência e consulta         | A repetição com a mesma chave e os mesmos parâmetros devolveu a mesma sessão para ambos os métodos. Em um teste adicional, o corpo da primeira resposta foi descartado. A repetição retornou `Idempotent-Replayed: true` e o `GET` recuperou a sessão sem criar outra tentativa.                                                                           |
| Expiração de sessão aberta      | A operação de expiração devolveu `expired`, e o webhook `checkout.session.expired` chegou ao receptor.                                                                                                                                                                                                                                                     |
| Expiração com QR PIX já emitido | Antes da chamada, a sessão estava `open` e `unpaid`, com PaymentIntent `requires_action` e QR presente. A expiração da sessão levou o PaymentIntent a `canceled` e removeu o QR da resposta da API. O receptor recebeu `payment_intent.canceled` e `checkout.session.expired`.                                                                             |
| Estorno integral                | A API confirmou o estorno de R$ 5,00 de cada pagamento. A repetição com a mesma chave recuperou o mesmo Refund. No PIX, o receptor viu `refund.created` com `pending` e depois `refund.updated` com `succeeded`. O `GET` confirmou `succeeded` para ambos.                                                                                                 |

O receptor HTTP temporário utilizado nessa prova não faz parte do repositório. Os resultados acima permanecem como evidência histórica da escolha do provedor. Para reproduzir a integração atual, utilize [Reprodução pelo Web](#reprodução-pelo-web), que recebe os eventos no endpoint da própria aplicação.
