/**
 * Formata a ocorrência no timezone canônico do Venue, nunca no timezone do navegador.
 *
 * @param startsAt - Instante persistido pela API.
 * @param timeZone - Identificador IANA do Venue.
 * @returns Data e horário localizados para apresentação compacta.
 */
export function formatEventDateTime(startsAt: string, timeZone: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone,
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
    .format(new Date(startsAt))
    .replace(',', ' ·');
}

/**
 * Formata por extenso o instante da ocorrência no calendário local do Venue.
 *
 * @param startsAt - Instante persistido pela API.
 * @param timeZone - Identificador IANA do Venue.
 * @returns Data completa e horário local para a página de detalhe.
 */
export function formatEventDetailDateTime(startsAt: string, timeZone: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone,
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
    .format(new Date(startsAt))
    .replace(',', ' ·');
}

/**
 * Apresenta o preço inteiro persistido pela API como moeda brasileira.
 *
 * @param priceCents - Preço em centavos.
 * @returns Valor formatado em reais.
 */
export function formatEventPrice(priceCents: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
    priceCents / 100,
  );
}
