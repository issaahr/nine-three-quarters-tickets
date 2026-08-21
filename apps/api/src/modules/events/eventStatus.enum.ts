/** Estado persistido do Event; eventos passados continuam derivados de `startsAt`. */
export enum EventStatus {
  Draft = 'DRAFT',
  Published = 'PUBLISHED',
  Cancelled = 'CANCELLED',
}
