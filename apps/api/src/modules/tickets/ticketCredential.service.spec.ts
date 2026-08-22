import { TicketCredentialService } from './ticketCredential.service';

describe('TicketCredentialService', () => {
  const service = new TicketCredentialService();

  it('assina uma credencial versionada e recupera seu publicId', () => {
    const publicId = 'a0a2f6b2-b572-4ee3-a6cd-8ab1a15d2cb9';
    const credential = service.createCredential(publicId);

    expect(credential).toMatch(/^v1\.[0-9a-f-]{36}\.[A-Za-z0-9_-]{43}$/i);
    expect(service.getVerifiedPublicId(credential)).toBe(publicId);
  });

  it.each([
    'v2.a0a2f6b2-b572-4ee3-a6cd-8ab1a15d2cb9.invalid',
    'v1.a0a2f6b2-b572-4ee3-a6cd-8ab1a15d2cb9.invalid',
    'v1.1.invalid',
    'a0a2f6b2-b572-4ee3-a6cd-8ab1a15d2cb9',
  ])('rejeita credencial inválida: %s', (credential) => {
    expect(service.getVerifiedPublicId(credential)).toBeNull();
  });

  it('gera código manual no formato sem caracteres ambíguos', () => {
    expect(service.createManualCode()).toMatch(
      /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}$/,
    );
  });

  it.each([
    ['7k4p-m9q2', '7K4P-M9Q2'],
    ['7K4P M9Q2', '7K4P-M9Q2'],
    [' 7k4p - m9q2 ', '7K4P-M9Q2'],
  ])('normaliza o código manual %s', (manualCode, expected) => {
    expect(service.normalizeManualCode(manualCode)).toBe(expected);
  });

  it.each(['7K4P-M9Q', '7K4P-09Q2', '7K4P-M9Q!', ''])(
    'rejeita código manual inválido: %s',
    (manualCode) => {
      expect(service.normalizeManualCode(manualCode)).toBeNull();
    },
  );
});
