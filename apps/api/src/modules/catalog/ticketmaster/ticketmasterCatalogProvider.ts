import { Injectable, Logger } from '@nestjs/common';

import { applicationConfig } from '../../../config/applicationConfig';
import { EventCategory } from '../../events/eventCategory.enum';
import { CatalogItem } from '../catalogItem';
import { CatalogPage } from '../catalogPage';
import { ShowCatalogProvider } from '../catalogProvider';
import { CatalogSource } from '../catalogSource.enum';
import { CatalogTimeoutError } from '../errors/catalogTimeout.error';
import { CatalogUnavailableError } from '../errors/catalogUnavailable.error';
import {
  TicketmasterAttraction,
  TicketmasterAttractionSearchResponse,
  TicketmasterClassification,
  TicketmasterClassificationLevel,
  TicketmasterImage,
  TicketmasterEvent,
  TicketmasterEventSearchResponse,
  TicketmasterPageMetadata,
} from './ticketmaster.types';

const ticketmasterApiBaseUrl = 'https://app.ticketmaster.com/discovery/v2/';
const ticketmasterPageSize = 20;
const ticketmasterRelevantEventsPageSize = 10;

@Injectable()
export class TicketmasterCatalogProvider implements ShowCatalogProvider {
  public readonly source = CatalogSource.Ticketmaster;

  private readonly logger = new Logger(TicketmasterCatalogProvider.name);

  /**
   * Pesquisa atrações e converte a paginação externa zero-based para o contrato interno one-based.
   *
   * @param query - Texto de pesquisa validado e normalizado pela API.
   * @param page - Página interna solicitada, iniciada em um.
   * @returns Página de atrações normalizadas sem atributos externos de venda.
   */
  public async search(query: string, page: number): Promise<CatalogPage> {
    const response = await this.request('attractions.json', {
      keyword: query,
      classificationName: 'music',
      page: String(page - 1),
      size: String(ticketmasterPageSize),
    });
    const payload = await this.readJson(response);

    if (!this.isAttractionSearchResponse(payload)) {
      throw new CatalogUnavailableError();
    }

    const attractions = payload._embedded?.attractions ?? [];

    return {
      items: attractions.map((attraction) => this.normalizeAttraction(attraction)),
      page: payload.page.number + 1,
      hasMore: payload.page.number + 1 < payload.page.totalPages,
    };
  }

  /**
   * Deriva atrações das ocorrências musicais relevantes no Brasil sem restringir a pesquisa textual.
   *
   * A Ticketmaster ordena os Events por relevância. Apenas a Attraction principal de cada ocorrência
   * é apresentada e identidades repetidas são eliminadas dentro da página externa.
   *
   * @param page - Página interna solicitada, iniciada em um.
   * @returns Atrações normalizadas correspondentes aos Events brasileiros da página.
   */
  public async listRelevantInBrazil(page: number): Promise<CatalogPage> {
    const response = await this.request('events.json', {
      countryCode: 'BR',
      classificationName: 'music',
      sort: 'relevance,desc',
      size: String(ticketmasterRelevantEventsPageSize),
      page: String(page - 1),
    });
    const payload = await this.readJson(response);

    if (!this.isEventSearchResponse(payload)) {
      throw new CatalogUnavailableError();
    }

    const uniqueAttractions = new Map<string, TicketmasterAttraction>();

    for (const event of payload._embedded?.events ?? []) {
      const attraction = event._embedded?.attractions?.[0];

      if (attraction && !uniqueAttractions.has(attraction.id)) {
        uniqueAttractions.set(attraction.id, attraction);
      }
    }

    return {
      items: [...uniqueAttractions.values()].map((attraction) =>
        this.normalizeAttraction(attraction),
      ),
      page: payload.page.number + 1,
      hasMore: payload.page.number + 1 < payload.page.totalPages,
    };
  }

  /**
   * Recarrega uma Attraction pela identidade externa antes da criação do snapshot local.
   *
   * @param externalId - Identidade atribuída pela Ticketmaster.
   * @returns Attraction normalizada ou `null` quando a identidade não existe.
   */
  public async findByExternalId(externalId: string): Promise<CatalogItem | null> {
    if (!/^[A-Za-z0-9_-]+$/.test(externalId) || externalId.length > 100) {
      return null;
    }

    const response = await this.request(`attractions/${encodeURIComponent(externalId)}.json`, {});

    if (response.status === 404) {
      return null;
    }

    const payload = await this.readJson(response);

    if (!this.isAttraction(payload)) {
      throw new CatalogUnavailableError();
    }

    return this.normalizeAttraction(payload);
  }

  /** Executa a chamada autenticada sem registrar a chave ou a URL completa. */
  private async request(path: string, parameters: Record<string, string>): Promise<Response> {
    const url = new URL(path, ticketmasterApiBaseUrl);
    url.search = new URLSearchParams({
      ...parameters,
      apikey: applicationConfig.catalog.ticketmaster.apiKey,
      locale: applicationConfig.catalog.ticketmaster.locale,
    }).toString();

    let response: Response;

    try {
      response = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(applicationConfig.catalog.ticketmaster.requestTimeoutMs),
      });
    } catch (cause) {
      if (cause instanceof DOMException && ['AbortError', 'TimeoutError'].includes(cause.name)) {
        throw new CatalogTimeoutError(cause);
      }

      throw new CatalogUnavailableError(cause);
    }

    if (!response.ok && response.status !== 404) {
      this.logger.warn(`Ticketmaster respondeu com status ${response.status} em ${path}`);
      throw new CatalogUnavailableError();
    }

    return response;
  }

  /** Converte o corpo HTTP para JSON e trata respostas ilegíveis como falha do catálogo. */
  private async readJson(response: Response): Promise<unknown> {
    try {
      return await response.json();
    } catch (cause) {
      throw new CatalogUnavailableError(cause);
    }
  }

  /** Produz o contrato neutro usado para pesquisa e reconstrução do snapshot. */
  private normalizeAttraction(attraction: TicketmasterAttraction): CatalogItem {
    return {
      source: CatalogSource.Ticketmaster,
      externalId: attraction.id,
      category: EventCategory.Show,
      title: attraction.name.trim(),
      description: this.normalizeOptionalText(attraction.description ?? attraction.additionalInfo),
      imageUrl: this.selectImageUrl(attraction.images ?? []),
      genres: this.normalizeClassifications(attraction.classifications ?? []),
    };
  }

  /** Remove espaços e representa textos externos vazios como ausência de valor. */
  private normalizeOptionalText(value: string | undefined): string | undefined {
    const normalized = value?.trim();
    return normalized || undefined;
  }

  /** Seleciona a maior imagem não fallback com URL HTTP segura para apresentação. */
  private selectImageUrl(images: TicketmasterImage[]): string | undefined {
    const candidates = images
      .filter((image) => this.isHttpUrl(image.url))
      .sort((left, right) => {
        const fallbackDifference = Number(left.fallback === true) - Number(right.fallback === true);

        if (fallbackDifference !== 0) {
          return fallbackDifference;
        }

        return (right.width ?? 0) * (right.height ?? 0) - (left.width ?? 0) * (left.height ?? 0);
      });

    return candidates[0]?.url;
  }

  /** Normaliza níveis úteis de classification sem persistir o formato da Ticketmaster. */
  private normalizeClassifications(classifications: TicketmasterClassification[]): string[] {
    const names = classifications.flatMap(({ segment, genre, subGenre }) =>
      [segment?.name, genre?.name, subGenre?.name]
        .map((name) => name?.trim())
        .filter(
          (name): name is string =>
            typeof name === 'string' &&
            name.length > 0 &&
            !['undefined', 'miscellaneous'].includes(name.toLowerCase()),
        ),
    );
    const uniqueNames = new Map<string, string>();

    for (const name of names) {
      uniqueNames.set(name.toLocaleLowerCase(), name);
    }

    return [...uniqueNames.values()];
  }

  /** Confirma que a URL externa utiliza somente HTTP ou HTTPS. */
  private isHttpUrl(value: string): boolean {
    try {
      return ['http:', 'https:'].includes(new URL(value).protocol);
    } catch {
      return false;
    }
  }

  /** Valida a estrutura mínima da resposta paginada antes de normalizá-la. */
  private isAttractionSearchResponse(
    value: unknown,
  ): value is TicketmasterAttractionSearchResponse {
    if (!this.isRecord(value) || !this.isPageMetadata(value.page)) {
      return false;
    }

    if (value._embedded === undefined) {
      return true;
    }

    return (
      this.isRecord(value._embedded) &&
      Array.isArray(value._embedded.attractions) &&
      value._embedded.attractions.every((attraction) => this.isAttraction(attraction))
    );
  }

  /** Valida a página de Events e as Attractions principais consumidas pela descoberta inicial. */
  private isEventSearchResponse(value: unknown): value is TicketmasterEventSearchResponse {
    if (!this.isRecord(value) || !this.isPageMetadata(value.page)) {
      return false;
    }

    if (value._embedded === undefined) {
      return true;
    }

    return (
      this.isRecord(value._embedded) &&
      Array.isArray(value._embedded.events) &&
      value._embedded.events.every((event) => this.isEvent(event))
    );
  }

  /** Valida somente o recorte de Event necessário para alcançar sua Attraction principal. */
  private isEvent(value: unknown): value is TicketmasterEvent {
    if (!this.isRecord(value) || value._embedded === undefined) {
      return this.isRecord(value);
    }

    return (
      this.isRecord(value._embedded) &&
      (value._embedded.attractions === undefined ||
        (Array.isArray(value._embedded.attractions) &&
          value._embedded.attractions.every((attraction) => this.isAttraction(attraction))))
    );
  }

  /** Valida os campos de paginação consumidos pelo contrato interno. */
  private isPageMetadata(value: unknown): value is TicketmasterPageMetadata {
    return (
      this.isRecord(value) &&
      Number.isInteger(value.size) &&
      Number.isInteger(value.totalElements) &&
      Number.isInteger(value.totalPages) &&
      Number.isInteger(value.number)
    );
  }

  /** Valida uma Attraction e todas as estruturas opcionais efetivamente consumidas. */
  private isAttraction(value: unknown): value is TicketmasterAttraction {
    return (
      this.isRecord(value) &&
      typeof value.id === 'string' &&
      typeof value.name === 'string' &&
      value.name.trim().length > 0 &&
      (value.description === undefined || typeof value.description === 'string') &&
      (value.additionalInfo === undefined || typeof value.additionalInfo === 'string') &&
      (value.images === undefined ||
        (Array.isArray(value.images) && value.images.every((image) => this.isImage(image)))) &&
      (value.classifications === undefined ||
        (Array.isArray(value.classifications) &&
          value.classifications.every((classification) => this.isClassification(classification))))
    );
  }

  /** Valida os metadados de imagem usados para a escolha determinística do asset. */
  private isImage(value: unknown): value is TicketmasterImage {
    return (
      this.isRecord(value) &&
      typeof value.url === 'string' &&
      (value.width === undefined || Number.isInteger(value.width)) &&
      (value.height === undefined || Number.isInteger(value.height)) &&
      (value.fallback === undefined || typeof value.fallback === 'boolean')
    );
  }

  /** Valida os níveis de classification que serão convertidos em gêneros locais. */
  private isClassification(value: unknown): value is TicketmasterClassification {
    return (
      this.isRecord(value) &&
      this.isOptionalClassificationLevel(value.segment) &&
      this.isOptionalClassificationLevel(value.genre) &&
      this.isOptionalClassificationLevel(value.subGenre)
    );
  }

  /** Valida um nível opcional sem depender dos demais campos da resposta externa. */
  private isOptionalClassificationLevel(
    value: unknown,
  ): value is TicketmasterClassificationLevel | undefined {
    return (
      value === undefined ||
      (this.isRecord(value) &&
        (value.id === undefined || typeof value.id === 'string') &&
        (value.name === undefined || typeof value.name === 'string'))
    );
  }

  /** Restringe valores desconhecidos a objetos que podem ser inspecionados com segurança. */
  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }
}
