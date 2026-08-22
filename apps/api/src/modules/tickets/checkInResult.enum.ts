/** Resultado semântico da tentativa de entrada na portaria. */
export enum CheckInResult {
  Valid = 'VALID',
  Invalid = 'INVALID',
  AlreadyUsed = 'ALREADY_USED',
  EventMismatch = 'EVENT_MISMATCH',
  Cancelled = 'CANCELLED',
}
