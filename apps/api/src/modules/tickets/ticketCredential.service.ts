import { Injectable } from '@nestjs/common';
import { createHmac, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';

import { applicationConfig } from '../../config/applicationConfig';

const credentialVersion = 'v1';
const manualCodeAlphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const manualCodePartLength = 4;
const manualCodeLength = manualCodePartLength * 2;
const expectedSignatureLength = 43;

/** Gera e valida credenciais que podem ser apresentadas sem expor IDs internos. */
@Injectable()
export class TicketCredentialService {
  /** Cria um identificador público aleatório, independente do ID interno do Ticket. */
  public createPublicId(): string {
    return randomUUID();
  }

  /** Cria o código humano de oito caracteres úteis exibido no Ticket. */
  public createManualCode(): string {
    const characters = Array.from(
      { length: manualCodeLength },
      () => manualCodeAlphabet[randomInt(manualCodeAlphabet.length)],
    );

    return `${characters.slice(0, manualCodePartLength).join('')}-${characters
      .slice(manualCodePartLength)
      .join('')}`;
  }

  /**
   * Assina a versão e o identificador público para formar a credencial apresentada no QR.
   *
   * @param publicId - Identificador público aleatório persistido para o Ticket.
   * @returns Credencial versionada que pode ser reconstruída sem ser persistida em claro.
   */
  public createCredential(publicId: string): string {
    return `${credentialVersion}.${publicId}.${this.createSignature(publicId)}`;
  }

  /**
   * Retorna o identificador público somente quando formato, versão e assinatura são válidos.
   *
   * @param credential - Credencial recebida pelo QR ou link compartilhável.
   * @returns publicId assinado ou null quando a credencial não for confiável.
   */
  public getVerifiedPublicId(credential: string): string | null {
    const [version, publicId, signature, extraPart] = credential.split('.');

    if (
      version !== credentialVersion ||
      !this.isUuid(publicId) ||
      !signature ||
      extraPart !== undefined ||
      !/^[A-Za-z0-9_-]+$/.test(signature)
    ) {
      return null;
    }

    const expectedSignature = Buffer.from(this.createSignature(publicId), 'base64url');
    const receivedSignature = Buffer.from(signature, 'base64url');

    if (
      signature.length !== expectedSignatureLength ||
      receivedSignature.length !== expectedSignature.length
    ) {
      return null;
    }

    return timingSafeEqual(expectedSignature, receivedSignature) ? publicId : null;
  }

  /**
   * Normaliza o código humano para o formato canônico persistido no Ticket.
   *
   * @param manualCode - Código informado pelo operador, com caixa, espaços e hífen livres.
   * @returns Código canônico ou null quando os caracteres ou o tamanho forem inválidos.
   */
  public normalizeManualCode(manualCode: string): string | null {
    const characters = manualCode.replace(/[\s-]/g, '').toUpperCase();

    if (
      characters.length !== manualCodeLength ||
      !Array.from(characters).every((character) => manualCodeAlphabet.includes(character))
    ) {
      return null;
    }

    return `${characters.slice(0, manualCodePartLength)}-${characters.slice(manualCodePartLength)}`;
  }

  private createSignature(publicId: string): string {
    return createHmac('sha256', applicationConfig.tickets.hmacSecret)
      .update(`${credentialVersion}.${publicId}`)
      .digest('base64url');
  }

  private isUuid(value: string | undefined): value is string {
    return Boolean(
      value && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value),
    );
  }
}
