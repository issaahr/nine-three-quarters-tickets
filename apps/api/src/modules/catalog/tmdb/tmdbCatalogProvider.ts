import { Injectable, Logger } from '@nestjs/common';

import { applicationConfig } from '../../../config/applicationConfig';
import { EventCategory } from '../../events/eventCategory.enum';
import { CatalogItem } from '../catalogItem';
import { CatalogProvider } from '../catalogProvider';
import { CatalogSource } from '../catalogSource.enum';
import { CatalogTimeoutError } from '../errors/catalogTimeout.error';
import { CatalogUnavailableError } from '../errors/catalogUnavailable.error';
import {
  TmdbConfigurationResponse,
  TmdbGenreListResponse,
  TmdbMovieDetails,
  TmdbMovieSearchResponse,
  TmdbMovieSearchResult,
} from './tmdb.types';

const tmdbApiBaseUrl = 'https://api.themoviedb.org/3/';

@Injectable()
export class TmdbCatalogProvider implements CatalogProvider {
  public readonly source = CatalogSource.Tmdb;

  private readonly logger = new Logger(TmdbCatalogProvider.name);
  private genreNamesPromise?: Promise<Map<number, string>>;
  private imageBaseUrlPromise?: Promise<string>;

  /**
   * Pesquisa filmes e converte os metadados externos para o contrato neutro do catálogo.
   */
  public async search(query: string): Promise<CatalogItem[]> {
    const response = await this.request('search/movie', {
      query,
      include_adult: 'false',
      language: applicationConfig.catalog.tmdb.language,
      page: '1',
    });
    const payload = await this.readJson(response);

    if (!this.isMovieSearchResponse(payload)) {
      throw new CatalogUnavailableError();
    }

    if (payload.results.length === 0) {
      return [];
    }

    const [genreNames, imageBaseUrl] = await Promise.all([
      payload.results.some(({ genre_ids }) => genre_ids?.length) ? this.getGenreNames() : new Map(),
      payload.results.some(({ poster_path }) => poster_path) ? this.getImageBaseUrl() : undefined,
    ]);

    return payload.results.map((movie) =>
      this.normalizeSearchResult(movie, genreNames, imageBaseUrl),
    );
  }

  /**
   * Recarrega um filme pela identidade externa e devolve dados normalizados para
   * que a criação do Event não confie no snapshot enviado pelo cliente.
   */
  public async findByExternalId(externalId: string): Promise<CatalogItem | null> {
    if (!/^\d+$/.test(externalId) || Number(externalId) <= 0) {
      return null;
    }

    const response = await this.request(`movie/${externalId}`, {
      language: applicationConfig.catalog.tmdb.language,
    });

    if (response.status === 404) {
      return null;
    }

    const payload = await this.readJson(response);

    if (!this.isMovieDetails(payload)) {
      throw new CatalogUnavailableError();
    }

    const imageBaseUrl = payload.poster_path ? await this.getImageBaseUrl() : undefined;

    return {
      source: CatalogSource.Tmdb,
      externalId: String(payload.id),
      category: EventCategory.Movie,
      title: payload.title,
      description: this.normalizeOptionalText(payload.overview),
      imageUrl: this.buildImageUrl(payload.poster_path, imageBaseUrl),
      genres: this.normalizeGenreNames(payload.genres?.map(({ name }) => name) ?? []),
    };
  }

  /**
   * Executa uma chamada autenticada sem expor credenciais em erros ou logs.
   */
  private async request(path: string, parameters: Record<string, string>): Promise<Response> {
    const url = new URL(path, tmdbApiBaseUrl);
    url.search = new URLSearchParams(parameters).toString();

    let response: Response;

    try {
      response = await fetch(url, {
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${applicationConfig.catalog.tmdb.accessToken}`,
        },
        signal: AbortSignal.timeout(applicationConfig.catalog.tmdb.requestTimeoutMs),
      });
    } catch (cause) {
      if (cause instanceof DOMException && ['AbortError', 'TimeoutError'].includes(cause.name)) {
        throw new CatalogTimeoutError(cause);
      }

      throw new CatalogUnavailableError(cause);
    }

    if (!response.ok && response.status !== 404) {
      this.logger.warn(`TMDb respondeu com status ${response.status} em ${path}`);
      throw new CatalogUnavailableError();
    }

    return response;
  }

  /**
   * Converte o corpo HTTP para JSON e trata respostas ilegíveis como falha do catálogo.
   */
  private async readJson(response: Response): Promise<unknown> {
    try {
      return await response.json();
    } catch (cause) {
      throw new CatalogUnavailableError(cause);
    }
  }

  /**
   * Compartilha a lista estática de gêneros entre buscas durante a vida do processo.
   */
  private getGenreNames(): Promise<Map<number, string>> {
    this.genreNamesPromise ??= this.loadGenreNames().catch((cause: unknown) => {
      this.genreNamesPromise = undefined;
      throw cause;
    });

    return this.genreNamesPromise;
  }

  /**
   * Carrega e valida a relação de gêneros publicada pela TMDb.
   */
  private async loadGenreNames(): Promise<Map<number, string>> {
    const response = await this.request('genre/movie/list', {
      language: applicationConfig.catalog.tmdb.language,
    });
    const payload = await this.readJson(response);

    if (!this.isGenreListResponse(payload)) {
      throw new CatalogUnavailableError();
    }

    return new Map(payload.genres.map(({ id, name }) => [id, name]));
  }

  /**
   * Compartilha a configuração estática de imagens sem cachear uma falha transitória.
   */
  private getImageBaseUrl(): Promise<string> {
    this.imageBaseUrlPromise ??= this.loadImageBaseUrl().catch((cause: unknown) => {
      this.imageBaseUrlPromise = undefined;
      throw cause;
    });

    return this.imageBaseUrlPromise;
  }

  /**
   * Carrega a base segura de imagens e confirma que ela suporta o tamanho configurado.
   */
  private async loadImageBaseUrl(): Promise<string> {
    const response = await this.request('configuration', {});
    const payload = await this.readJson(response);

    if (!this.isConfigurationResponse(payload)) {
      throw new CatalogUnavailableError();
    }

    const { posterSize } = applicationConfig.catalog.tmdb;

    if (!payload.images.poster_sizes.includes(posterSize)) {
      throw new CatalogUnavailableError();
    }

    return new URL(`${posterSize}/`, payload.images.secure_base_url).toString();
  }

  /**
   * Produz um item de catálogo sem incorporar atributos locais de venda ou inventário.
   */
  private normalizeSearchResult(
    movie: TmdbMovieSearchResult,
    genreNames: Map<number, string>,
    imageBaseUrl: string | undefined,
  ): CatalogItem {
    return {
      source: CatalogSource.Tmdb,
      externalId: String(movie.id),
      category: EventCategory.Movie,
      title: movie.title,
      description: this.normalizeOptionalText(movie.overview),
      imageUrl: this.buildImageUrl(movie.poster_path, imageBaseUrl),
      genres: this.normalizeGenreNames(
        (movie.genre_ids ?? []).flatMap((id) => genreNames.get(id) ?? []),
      ),
    };
  }

  /**
   * Remove espaços e representa textos externos vazios como ausência de valor.
   */
  private normalizeOptionalText(value: string | undefined): string | undefined {
    const normalized = value?.trim();
    return normalized || undefined;
  }

  /**
   * Elimina gêneros vazios ou repetidos preservando a ordem recebida.
   */
  private normalizeGenreNames(names: string[]): string[] {
    return [...new Set(names.map((name) => name.trim()).filter(Boolean))];
  }

  /**
   * Monta a URL do pôster somente quando caminho e configuração estão disponíveis.
   */
  private buildImageUrl(
    path: string | null | undefined,
    imageBaseUrl: string | undefined,
  ): string | undefined {
    if (!path || !imageBaseUrl) {
      return undefined;
    }

    return new URL(path.replace(/^\//, ''), imageBaseUrl).toString();
  }

  /**
   * Verifica em runtime a estrutura mínima exigida da resposta de pesquisa.
   */
  private isMovieSearchResponse(value: unknown): value is TmdbMovieSearchResponse {
    return (
      this.isRecord(value) &&
      Array.isArray(value.results) &&
      value.results.every((movie) => this.isMovieSearchResult(movie))
    );
  }

  /**
   * Verifica os campos consumidos de cada resultado antes da normalização.
   */
  private isMovieSearchResult(value: unknown): value is TmdbMovieSearchResult {
    return (
      this.isRecord(value) &&
      Number.isInteger(value.id) &&
      typeof value.title === 'string' &&
      (value.overview === undefined || typeof value.overview === 'string') &&
      (value.poster_path === undefined ||
        value.poster_path === null ||
        typeof value.poster_path === 'string') &&
      (value.genre_ids === undefined ||
        (Array.isArray(value.genre_ids) && value.genre_ids.every(Number.isInteger)))
    );
  }

  /**
   * Verifica os campos consumidos dos detalhes e a estrutura opcional de gêneros.
   */
  private isMovieDetails(value: unknown): value is TmdbMovieDetails {
    return (
      this.isMovieSearchResult(value) &&
      (value.genres === undefined ||
        (Array.isArray(value.genres) &&
          value.genres.every(
            (genre) =>
              this.isRecord(genre) && Number.isInteger(genre.id) && typeof genre.name === 'string',
          )))
    );
  }

  /**
   * Verifica a lista externa de gêneros antes de armazená-la no cache do processo.
   */
  private isGenreListResponse(value: unknown): value is TmdbGenreListResponse {
    return (
      this.isRecord(value) &&
      Array.isArray(value.genres) &&
      value.genres.every(
        (genre) =>
          this.isRecord(genre) && Number.isInteger(genre.id) && typeof genre.name === 'string',
      )
    );
  }

  /**
   * Verifica a configuração de imagens usada para construir URLs de pôster.
   */
  private isConfigurationResponse(value: unknown): value is TmdbConfigurationResponse {
    return (
      this.isRecord(value) &&
      this.isRecord(value.images) &&
      typeof value.images.secure_base_url === 'string' &&
      Array.isArray(value.images.poster_sizes) &&
      value.images.poster_sizes.every((size) => typeof size === 'string')
    );
  }

  /**
   * Restringe valores desconhecidos a objetos que podem ser inspecionados com segurança.
   */
  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }
}
