# Validação do Stripe Checkout no sandbox

A [S12](https://github.com/issaahr/nine-three-quarters-tickets/issues/35) usa o Stripe Checkout hospedado para cartão e Pix em BRL. O modo Stripe usa chaves e objetos de teste. O modo fake permanece disponível para a demonstração local.

## Configuração local

Para obter as credenciais, siga [Stripe no README](../README.md#stripe): selecione o sandbox no Dashboard, abra [Chaves de API](https://dashboard.stripe.com/apikeys), revele a chave secreta `sk_test_...` e copie-a para `PAYMENT_STRIPE_SECRET_KEY` em `env/api.env`. O segredo `PAYMENT_STRIPE_WEBHOOK_SECRET` é obtido separadamente: no desenvolvimento local, copie o `whsec_...` exibido pelo listener abaixo. Para a API publicada no Render, o README também explica como criar o destino HTTPS e revelar o segredo desse destino no Dashboard.

1. Em uma conta com Pix habilitável, crie ou selecione o sandbox, confirme que cartão e Pix estão disponíveis nas configurações de métodos de pagamento e instale a Stripe CLI. Use o mesmo sandbox na CLI, no Dashboard e na API da aplicação. [Sandboxes da Stripe](https://docs.stripe.com/sandboxes) · [Configuração do Pix](https://docs.stripe.com/payments/pix/accept-a-payment?payment-ui=checkout) · [Instalação da Stripe CLI](https://docs.stripe.com/cli/install)
2. Configure de forma privada a variável `STRIPE_API_KEY` no processo da CLI com a chave de teste do sandbox. Inicie o encaminhamento em um terminal separado. O comando encaminha os quatro eventos de sessão processados pela API e exibe o segredo de assinatura desse listener. [Stripe CLI `listen`](https://docs.stripe.com/cli/listen)

   ```bash
   stripe listen --events checkout.session.completed,checkout.session.async_payment_succeeded,checkout.session.async_payment_failed,checkout.session.expired --forward-to http://localhost:3000/payments/webhooks/stripe
   ```

3. Crie os três arquivos locais em `env/` conforme o [README](../README.md#1-configurar-o-ambiente). Defina `VITE_API_URL=http://localhost:3000` em `env/web.env`. Em `env/api.env`, preencha as demais variáveis do backend e as opções abaixo. Revele a chave secreta `sk_test_...` do sandbox e use o segredo `whsec_...` do listener ativo. Um webhook criado pelo Dashboard tem seu próprio segredo. [Chaves da Stripe](https://docs.stripe.com/keys) · [Assinaturas de webhooks](https://docs.stripe.com/webhooks/signatures)

   ```env
   PAYMENT_PROVIDER=stripe
   PAYMENT_STRIPE_SECRET_KEY=<chave-sk_test-do-sandbox>
   PAYMENT_STRIPE_WEBHOOK_SECRET=<segredo-whsec-do-listener>
   CORS_ORIGINS=http://localhost:5173
   ```

   Em instalações existentes, migre as chaves manualmente do antigo arquivo compartilhado ou do antigo `.stripe-api.env` para `env/api.env`. O Web recebe apenas os valores públicos de `env/web.env`. [Migração da configuração](../README.md#1-configurar-o-ambiente)

4. Abra a Web na origem exata de `CORS_ORIGINS`. A primeira origem monta o retorno para `/customer/reservations/:reservationId` nas novas tentativas. As sessões já criadas conservam o endereço original. Ao trocar a primeira origem, mantenha a rota anterior acessível enquanto houver sessões em uso. Use o mesmo host na Web e na API quando rodar localmente. Com Docker Compose, mantenha o host `postgres` em `DATABASE_URL` e use `docker compose up --build -d`. A CLI no host alcança a porta publicada da API. Com a API executada via Node.js, use `localhost` em `DATABASE_URL` e inicie o PostgreSQL, a API e a Web conforme o README. [Execução com Docker ou Node.js](../README.md#como-executar)
5. Para testar com dados locais, crie eventos com preço positivo em BRL, de assentos numerados e de entrada geral, ou execute a seed de demonstração após a inicialização da API. Use uma conta `CUSTOMER` para pagar e uma conta `ORGANIZER` para cancelar um evento próprio. [Seed e usuários de demonstração](../README.md#dados-locais-e-testes)

O `GET /payments/configuration` autenticado como `CUSTOMER` informa o modo `HOSTED` ou `SIMULATED` e os métodos disponíveis. Para voltar à demonstração, defina `PAYMENT_PROVIDER=fake` em `env/api.env` e reinicie a API. Em Compose, aplique as alterações recriando o serviço com `docker compose up -d --force-recreate api`.

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

Em caso de falha técnica ao iniciar a sessão, volte à reserva. Se a tentativa já estiver registrada e elegível, use **Retomar pagamento**. O Web consulta o `GET /reservations/:reservationId/payments/hosted` e retoma a tentativa encontrada com `POST /reservations/:reservationId/payments/hosted/:paymentId/resume`. O navegador só redireciona com a URL devolvida pela nova resposta da API. O estado exibido no retorno vem da API.

As rotas de checkout compartilham uma quota por cliente autenticado. Se receber `429` com `RATE_LIMIT_EXCEEDED`, aguarde antes de consultar ou retomar. O limite do cliente não se aplica ao webhook. No Render Free, a conciliação aguarda a API voltar se o serviço estiver hibernando. [Instâncias Free no Render](https://render.com/docs/free#spinning-down-on-idle)

Uma falha de criação com resultado desconhecido mantém a tentativa pendente. A API busca a sessão pela identidade local e pode repetir a mesma chave dentro da janela segura quando conhece a URL original. Em tentativas legadas sem a URL original, a recuperação se limita à descoberta da sessão. Uma tentativa inconclusiva continua bloqueando outra tentativa da mesma reserva. Se o hold vencer, o inventário volta a ficar disponível.

O checkout hospedado valida o total positivo antes de criar a tentativa. No sandbox em BRL, o mínimo é R$ 0,50 e o máximo Pix é R$ 999.999,99. Para cartão, o teto local é R$ 21.474.836,47 pela representação dos centavos, sujeito aos limites da rede escolhida na Stripe. Um valor incompatível retorna HTTP `422` com `PAYMENT_AMOUNT_UNSUPPORTED`. O cliente pode selecionar outro método sem retomar a tentativa rejeitada. Reservas gratuitas são confirmadas localmente. [Limites de valores da Stripe](https://docs.stripe.com/currencies#minimum-and-maximum-charge-amounts)

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

### Reprodução da prova avulsa

1. Use um [sandbox da Stripe](https://docs.stripe.com/sandboxes) com cartão e PIX habilitados. A configuração local usa `PAYMENT_STRIPE_SECRET_KEY` com a chave `sk_test_...`. Para executar os comandos a seguir, passe essa chave à CLI pela variável `STRIPE_API_KEY` no ambiente do processo.
2. Para receber eventos, rode `stripe listen --all-snapshot --forward-to http://127.0.0.1:4242/stripe`. Passe o `whsec_...` exibido ao receptor local. Verifique `Stripe-Signature` com o corpo bruto recebido antes de decodificar e registrar o evento. Registre tipo, status, valor e moeda, correlacionando os eventos à sessão e ao pagamento. Envie também uma requisição sem assinatura para verificar a rejeição. [Stripe CLI](https://docs.stripe.com/cli/listen) · [Verificação de assinatura](https://docs.stripe.com/webhooks/signatures)
3. Crie a sessão no terminal. Execute uma vez com `method=card` e outra com `method=pix`, usando uma chave de idempotência distinta para cada sessão. Para testar a retomada, repita o comando com os mesmos parâmetros e a mesma chave e compare o ID devolvido.

   ```bash
   method=card
   attempt_key='<uuid-da-tentativa>'
   stripe post /v1/checkout/sessions \
     --stripe-version 2026-11-18.endive \
     --idempotency "$attempt_key" \
     -d 'mode=payment' \
     -d "allowed_payment_method_types[0]=$method" \
     -d 'line_items[0][price_data][currency]=brl' \
     -d 'line_items[0][price_data][unit_amount]=500' \
     -d 'line_items[0][price_data][product_data][name]=9¾ Tickets S12 sandbox' \
     -d 'line_items[0][quantity]=1' \
     -d 'success_url=http://localhost:5173/events'
   ```

4. Abra a `url` devolvida. Para cartão, use o número `4242 4242 4242 4242`, validade futura e CVC de teste. Para PIX, use `succeed_immediately@example.com`. Se o Checkout pedir um identificador fiscal, use `000.000.000-00`. Consulte a sessão com `stripe get /v1/checkout/sessions/<id>` e confira o PaymentIntent e os eventos recebidos. [Cartões de teste](https://docs.stripe.com/testing) · [PIX de teste](https://docs.stripe.com/payments/pix/accept-a-payment?payment-ui=checkout)
5. Para o cenário de PIX pendente, crie outra sessão com `-d 'payment_method_options[pix][expires_after_seconds]=60'` e use `fill_never@example.com`. Depois que o QR aparecer, consulte a sessão com `stripe get /v1/checkout/sessions/<id> --expand payment_intent`, expire-a com `stripe post /v1/checkout/sessions/<id>/expire` e consulte novamente. Verifique o estado da sessão e do PaymentIntent. A expiração manual está disponível quando a sessão ainda está `open`. [Expiração de sessão](https://docs.stripe.com/api/checkout/sessions/expire)
6. Para cada pagamento aprovado, crie um estorno integral com `stripe post /v1/refunds --idempotency <chave-do-estorno> -d 'payment_intent=<id>'`. Repita com os mesmos parâmetros e confira o mesmo ID. Acompanhe `refund.updated` e consulte `stripe get /v1/refunds/<id>` até o status terminal. [Estornos da Stripe](https://docs.stripe.com/api/refunds)

## Comportamento da integração

- Nesta versão da API, a criação usa `allowed_payment_method_types`. A resposta informa o conjunto compatível em `payment_method_types`. A aplicação deve conferir se o método pretendido foi aceito. [Mudança na API Stripe Endive](https://docs.stripe.com/changelog/endive/2026-09-30/remove-payment-method-types-checkout-sessions)
- A expiração automática da sessão tem mínimo de 30 minutos. O Pix tem prazo próprio, que pode ser configurado a partir de 60 segundos e começa na confirmação do PaymentIntent. O hold continua regido por `Reservation.expiresAt` e pelo relógio do PostgreSQL. O backend solicita a expiração da sessão quando ainda aberta e concilia o resultado. Caso uma cobrança seja aprovada sem reserva válida, a aplicação registra o estorno integral e deixa de emitir Tickets. [Criação da sessão](https://docs.stripe.com/api/checkout/sessions/create) · [Validade do Pix](https://docs.stripe.com/payments/pix/accept-a-payment?payment-ui=checkout)
- Os eventos são sinais para conciliar o estado atual. O retorno do navegador apresenta o estado da API. `Refund` só chega a `COMPLETED` após a confirmação externa. As referências e os estados da Stripe são interpretados no adaptador de pagamentos. [Webhooks da Stripe](https://docs.stripe.com/webhooks) · [Escopo da aplicação](application-scope.md)
