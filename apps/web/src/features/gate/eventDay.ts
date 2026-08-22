function getVenueDateKey(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const valueByType = new Map(parts.map(({ type, value }) => [type, value]));

  return `${valueByType.get('year')}-${valueByType.get('month')}-${valueByType.get('day')}`;
}

export function isEventOnCurrentVenueDay(startsAt: string, timeZone: string): boolean {
  return getVenueDateKey(new Date(startsAt), timeZone) === getVenueDateKey(new Date(), timeZone);
}
