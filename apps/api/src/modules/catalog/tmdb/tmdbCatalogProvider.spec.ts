import { EventCategory } from '../../events/eventCategory.enum';
import { CatalogSource } from '../catalogSource.enum';
import { CatalogTimeoutError } from '../errors/catalogTimeout.error';
import { CatalogUnavailableError } from '../errors/catalogUnavailable.error';
import { TmdbCatalogProvider } from './tmdbCatalogProvider';

describe('TmdbCatalogProvider', () => {
  let fetchMock: jest.SpiedFunction<typeof fetch>;

  beforeEach(() => {
    fetchMock = jest.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchMock.mockRestore();
  });

  function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  function mockStaticMetadata(): void {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          genres: [
            { id: 12, name: 'Aventura' },
            { id: 878, name: 'Ficção científica' },
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          images: {
            secure_base_url: 'https://image.tmdb.org/t/p/',
            poster_sizes: ['w342', 'w500', 'original'],
          },
        }),
      );
  }

  it('pesquisa e normaliza filmes sem importar valores locais de venda', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        results: [
          {
            id: 693134,
            title: 'Duna: Parte Dois',
            overview: '  O retorno a Arrakis.  ',
            poster_path: '/poster.jpg',
            genre_ids: [878, 12, 999],
          },
        ],
      }),
    );
    mockStaticMetadata();

    const result = await new TmdbCatalogProvider().search('Duna & areia');

    expect(result).toEqual([
      {
        source: CatalogSource.Tmdb,
        externalId: '693134',
        category: EventCategory.Movie,
        title: 'Duna: Parte Dois',
        description: 'O retorno a Arrakis.',
        imageUrl: 'https://image.tmdb.org/t/p/w500/poster.jpg',
        genres: ['Ficção científica', 'Aventura'],
      },
    ]);
    expect(result[0]).not.toHaveProperty('priceCents');
    expect(result[0]).not.toHaveProperty('startsAt');
    expect(result[0]).not.toHaveProperty('capacity');

    const [url, options] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/search/movie?');
    expect(String(url)).toContain('query=Duna+%26+areia');
    expect(String(url)).toContain('include_adult=false');
    expect(String(url)).toContain('language=pt-BR');
    expect(options?.headers).toMatchObject({
      Accept: 'application/json',
      Authorization: 'Bearer test-tmdb-token',
    });
  });

  it('normaliza detalhes e representa poster ausente sem URL fabricada', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        id: 693134,
        title: 'Duna: Parte Dois',
        overview: '',
        poster_path: null,
        genres: [{ id: 878, name: 'Ficção científica' }],
      }),
    );

    await expect(new TmdbCatalogProvider().findByExternalId('693134')).resolves.toEqual({
      source: CatalogSource.Tmdb,
      externalId: '693134',
      category: EventCategory.Movie,
      title: 'Duna: Parte Dois',
      description: undefined,
      imageUrl: undefined,
      genres: ['Ficção científica'],
    });
  });

  it('retorna null quando o filme não existe ou a identidade é inválida', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}, 404));
    const provider = new TmdbCatalogProvider();

    await expect(provider.findByExternalId('999999')).resolves.toBeNull();
    await expect(provider.findByExternalId('invalid')).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('não cacheia uma falha ao carregar metadata estática', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          results: [{ id: 1, title: 'Filme', genre_ids: [12], poster_path: '/poster.jpg' }],
        }),
      )
      .mockResolvedValueOnce(jsonResponse({}, 503))
      .mockResolvedValueOnce(
        jsonResponse({
          images: {
            secure_base_url: 'https://image.tmdb.org/t/p/',
            poster_sizes: ['w500'],
          },
        }),
      );

    const provider = new TmdbCatalogProvider();
    await expect(provider.search('Filme')).rejects.toThrow(CatalogUnavailableError);

    fetchMock.mockReset();
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          results: [{ id: 1, title: 'Filme', genre_ids: [12], poster_path: '/poster.jpg' }],
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ genres: [] }));
    await expect(provider.search('Filme')).resolves.toHaveLength(1);
  });

  it('distingue timeout de indisponibilidade e rejeita payload incompatível', async () => {
    fetchMock.mockRejectedValueOnce(new DOMException('timeout', 'TimeoutError'));
    await expect(new TmdbCatalogProvider().search('Duna')).rejects.toThrow(CatalogTimeoutError);

    fetchMock.mockResolvedValueOnce(jsonResponse({ results: 'invalid' }));
    await expect(new TmdbCatalogProvider().search('Duna')).rejects.toThrow(CatalogUnavailableError);
  });
});
