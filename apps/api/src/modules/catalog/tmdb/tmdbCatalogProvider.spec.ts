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
        page: 1,
        total_pages: 3,
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

    const result = await new TmdbCatalogProvider().search('Duna & areia', 1);

    expect(result).toEqual({
      items: [
        {
          source: CatalogSource.Tmdb,
          externalId: '693134',
          category: EventCategory.Movie,
          title: 'Duna: Parte Dois',
          description: 'O retorno a Arrakis.',
          imageUrl: 'https://image.tmdb.org/t/p/w500/poster.jpg',
          genres: ['Ficção científica', 'Aventura'],
        },
      ],
      page: 1,
      hasMore: true,
    });
    expect(result.items[0]).not.toHaveProperty('priceCents');
    expect(result.items[0]).not.toHaveProperty('startsAt');
    expect(result.items[0]).not.toHaveProperty('capacity');

    const [url, options] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/search/movie?');
    expect(String(url)).toContain('query=Duna+%26+areia');
    expect(String(url)).toContain('include_adult=false');
    expect(String(url)).toContain('language=pt-BR');
    expect(String(url)).toContain('page=1');
    expect(options?.headers).toMatchObject({
      Accept: 'application/json',
      Authorization: 'Bearer test-tmdb-token',
    });
  });

  it('lista filmes populares preservando a paginação normalizada', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        page: 2,
        total_pages: 2,
        results: [{ id: 42, title: 'Filme em alta' }],
      }),
    );

    await expect(new TmdbCatalogProvider().listPopular(2)).resolves.toEqual({
      items: [
        {
          source: CatalogSource.Tmdb,
          externalId: '42',
          category: EventCategory.Movie,
          title: 'Filme em alta',
          description: undefined,
          imageUrl: undefined,
          genres: [],
        },
      ],
      page: 2,
      hasMore: false,
    });
    expect(String(fetchMock.mock.calls[0][0])).toContain('/movie/popular?');
    expect(String(fetchMock.mock.calls[0][0])).toContain('page=2');
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
          page: 1,
          total_pages: 1,
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
    await expect(provider.search('Filme', 1)).rejects.toThrow(CatalogUnavailableError);

    fetchMock.mockReset();
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          page: 1,
          total_pages: 1,
          results: [{ id: 1, title: 'Filme', genre_ids: [12], poster_path: '/poster.jpg' }],
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ genres: [] }));
    const result = await provider.search('Filme', 1);
    expect(result.items).toHaveLength(1);
  });

  it('distingue timeout de indisponibilidade e rejeita payload incompatível', async () => {
    fetchMock.mockRejectedValueOnce(new DOMException('timeout', 'TimeoutError'));
    await expect(new TmdbCatalogProvider().search('Duna', 1)).rejects.toThrow(CatalogTimeoutError);

    fetchMock.mockResolvedValueOnce(jsonResponse({ results: 'invalid' }));
    await expect(new TmdbCatalogProvider().search('Duna', 1)).rejects.toThrow(
      CatalogUnavailableError,
    );
  });
});
