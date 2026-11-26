/** Aceita o endereço HTTPS fornecido pela API, inclusive domínios hospedados de outros provedores. */
export function navigateToHostedCheckout(checkoutUrl: string): void {
  const url = new URL(checkoutUrl);
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new Error('Endereço do checkout inválido');
  }
  window.location.assign(url.href);
}
