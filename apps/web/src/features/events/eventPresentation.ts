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
 * Formata o contexto operacional da portaria com os dados locais do Venue.
 *
 * @param startsAt - Instante persistido pela API.
 * @param timeZone - Identificador IANA do Venue.
 * @returns Data, horário e offset no formato compacto usado pela portaria.
 */
export function formatGateEventDateTime(startsAt: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('pt-BR', {
    timeZone,
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZoneName: 'longOffset',
  }).formatToParts(new Date(startsAt));
  const getPart = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? '';
  const weekday = getPart('weekday').replace('.', '').toUpperCase();
  const month = getPart('month').replace('.', '').toUpperCase();
  const offset = getPart('timeZoneName').replace('GMT', 'UTC').replace('-', '−');

  return `${weekday} · ${getPart('day')} ${month} · ${getPart('hour')}:${getPart('minute')} · ${offset}`;
}

/**
 * Formata data e horário compactos para a apresentação individual do ingresso.
 *
 * @param startsAt - Instante persistido pela API.
 * @param timeZone - Identificador IANA do Venue.
 * @returns Data e horário no formato curto do ingresso.
 */
export function formatTicketEventDateTime(startsAt: string, timeZone: string): string {
  const date = new Date(startsAt);
  const weekday = new Intl.DateTimeFormat('pt-BR', { timeZone, weekday: 'short' })
    .format(date)
    .replace('.', '')
    .toUpperCase()
    .replace('QUI', 'QUIN');
  const parts = new Intl.DateTimeFormat('pt-BR', {
    timeZone,
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const getPart = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? '';

  return `${weekday} · ${getPart('day')} ${getPart('month').replace('.', '').toUpperCase()} · ${getPart('hour')}:${getPart('minute')}`;
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
