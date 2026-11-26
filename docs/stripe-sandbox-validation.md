# Validação do Stripe Checkout no sandbox

A [S12](https://github.com/issaahr/nine-three-quarters-tickets/issues/35) usa o Stripe Checkout hospedado para cartão e PIX em BRL. Em 26 de novembro de 2026, os testes abaixo foram executados em um sandbox de uma conta brasileira, com a API `2026-11-18.endive` e a Stripe CLI `1.55.15`. Foram criadas sessões avulsas de R$ 5,00, verificadas como `livemode=false`. O receptor HTTP local foi montado para esse teste. A integração com reservas, inventário e Tickets será verificada nos commits de implementação.

## Resultados

| Cenário | Resultado observado |
| --- | --- |
| Cartão | Pagamento concluído no Checkout hospedado com cartão de teste. A API retornou sessão `complete`, `payment_status=paid` e PaymentIntent `succeeded`. |
| PIX | A página hospedada exibiu o QR de teste. O endereço de e-mail de aprovação imediata levou a sessão a `complete`, com `payment_status=paid` e PaymentIntent `succeeded`. |
| Webhooks | A Stripe CLI encaminhou eventos das sessões ao receptor local, que verificou a assinatura sobre o corpo bruto. Cartão e PIX produziram `payment_intent.succeeded` e `checkout.session.completed`. A requisição de controle sem assinatura recebeu HTTP `400`. No teste de cartão, o evento de criação do PaymentIntent chegou depois do evento de sucesso. |
| Idempotência e consulta | A repetição com a mesma chave e os mesmos parâmetros devolveu a mesma sessão para ambos os métodos. Em um teste adicional, o corpo da primeira resposta foi descartado. A repetição retornou `Idempotent-Replayed: true` e o `GET` recuperou a sessão sem criar outra tentativa. |
| Expiração de sessão aberta | A operação de expiração devolveu `expired`, e o webhook `checkout.session.expired` chegou ao receptor. |
| Expiração com QR PIX já emitido | Antes da chamada, a sessão estava `open` e `unpaid`, com PaymentIntent `requires_action` e QR presente. A expiração da sessão levou o PaymentIntent a `canceled` e removeu o QR da resposta da API. O receptor recebeu `payment_intent.canceled` e `checkout.session.expired`. |
| Estorno integral | A API confirmou o estorno de R$ 5,00 de cada pagamento. A repetição com a mesma chave recuperou o mesmo Refund. No PIX, o receptor viu `refund.created` com `pending` e depois `refund.updated` com `succeeded`. O `GET` confirmou `succeeded` para ambos. |

## Reprodução

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

## Implicações para a implementação

- Nesta versão da API, a criação usa `allowed_payment_method_types`. A resposta informa o conjunto compatível em `payment_method_types`. A aplicação deve conferir se o método pretendido foi aceito. [Mudança na API Stripe Endive](https://docs.stripe.com/changelog/endive/2026-09-30/remove-payment-method-types-checkout-sessions)
- A expiração automática da sessão tem mínimo de 30 minutos. O PIX tem prazo próprio, que pode ser configurado a partir de 60 segundos e começa na confirmação do PaymentIntent. O hold continua regido por `Reservation.expiresAt` e pelo relógio do PostgreSQL. O backend solicitará a expiração da sessão quando ainda aberta e conciliará o resultado. Caso uma cobrança seja aprovada sem reserva válida, a aplicação registra o estorno integral e deixa de emitir Tickets. [Criação da sessão](https://docs.stripe.com/api/checkout/sessions/create) · [Validade do PIX](https://docs.stripe.com/payments/pix/accept-a-payment?payment-ui=checkout)
- Os eventos são sinais para conciliar o estado atual. O retorno do navegador apresenta o estado da API. `Refund` só chega a `COMPLETED` após a confirmação externa. As referências e os estados da Stripe são interpretados no adaptador de pagamentos. [Webhooks da Stripe](https://docs.stripe.com/webhooks) · [Escopo da aplicação](application-scope.md)
