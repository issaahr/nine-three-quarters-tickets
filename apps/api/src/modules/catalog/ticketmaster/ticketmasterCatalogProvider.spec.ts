import { EventCategory } from '../../events/eventCategory.enum';
import { CatalogSource } from '../catalogSource.enum';
import { CatalogTimeoutError } from '../errors/catalogTimeout.error';
import { CatalogUnavailableError } from '../errors/catalogUnavailable.error';
import { TicketmasterCatalogProvider } from './ticketmasterCatalogProvider';

describe('TicketmasterCatalogProvider', () => {
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

  it('pesquisa Attractions e normaliza paginação, imagem e classifications', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        _embedded: {
          attractions: [
            {
              id: 'K8vZ917Gku7',
              name: '  Florence + The Machine  ',
              description: '  Atração internacional.  ',
              images: [
                {
                  url: 'https://s1.ticketm.net/fallback.jpg',
                  width: 2048,
                  height: 1152,
                  fallback: true,
                },
                {
                  url: 'https://s1.ticketm.net/artist-small.jpg',
                  width: 640,
                  height: 360,
                  fallback: false,
                },
                {
                  url: 'https://s1.ticketm.net/artist-large.jpg',
                  width: 1024,
                  height: 576,
                  fallback: false,
                },
              ],
              classifications: [
                {
                  segment: { id: 'music', name: 'Music' },
                  genre: { id: 'rock', name: 'Rock' },
                  subGenre: { id: 'alternative', name: 'Alternative Rock' },
                },
                {
                  segment: { id: 'music', name: 'Music' },
                  genre: { id: 'undefined', name: 'Undefined' },
                },
              ],
            },
          ],
        },
        page: { size: 20, totalElements: 45, totalPages: 3, number: 1 },
      }),
    );

    const result = await new TicketmasterCatalogProvider().search('Florence & rock', 2);

    expect(result).toEqual({
      items: [
        {
          source: CatalogSource.Ticketmaster,
          externalId: 'K8vZ917Gku7',
          category: EventCategory.Show,
          title: 'Florence + The Machine',
          description: 'Atração internacional.',
          imageUrl: 'https://s1.ticketm.net/artist-large.jpg',
          genres: ['Music', 'Rock', 'Alternative Rock'],
        },
      ],
      page: 2,
      hasMore: true,
    });
    expect(result.items[0]).not.toHaveProperty('priceCents');
    expect(result.items[0]).not.toHaveProperty('startsAt');
    expect(result.items[0]).not.toHaveProperty('capacity');

    const [url, options] = fetchMock.mock.calls[0];
    const requestedUrl = new URL(String(url));
    expect(requestedUrl.pathname).toBe('/discovery/v2/attractions.json');
    expect(requestedUrl.searchParams.get('keyword')).toBe('Florence & rock');
    expect(requestedUrl.searchParams.get('classificationName')).toBe('music');
    expect(requestedUrl.searchParams.get('page')).toBe('1');
    expect(requestedUrl.searchParams.get('size')).toBe('20');
    expect(requestedUrl.searchParams.get('apikey')).toBe('test-ticketmaster-key');
    expect(requestedUrl.searchParams.get('locale')).toBe('pt-BR');
    expect(options?.headers).toEqual({ Accept: 'application/json' });
  });

  it('representa uma página vazia quando a Ticketmaster omite _embedded', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ page: { size: 20, totalElements: 0, totalPages: 0, number: 0 } }),
    );

    await expect(new TicketmasterCatalogProvider().search('Sem resultado', 1)).resolves.toEqual({
      items: [],
      page: 1,
      hasMore: false,
    });
  });

  it('deriva atrações únicas dos eventos musicais relevantes no Brasil', async () => {
    const attraction = {
      id: 'K8vZ917Gku7',
      name: 'System of a Down',
      images: [{ url: 'https://s1.ticketm.net/system.jpg', width: 1024, height: 576 }],
      classifications: [{ segment: { name: 'Music' }, genre: { name: 'Metal' } }],
    };
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        _embedded: {
          events: [
            { _embedded: { attractions: [attraction] } },
            { _embedded: { attractions: [attraction] } },
            { name: 'Evento sem atração' },
          ],
        },
        page: { size: 10, totalElements: 25, totalPages: 3, number: 0 },
      }),
    );

    await expect(new TicketmasterCatalogProvider().listRelevantInBrazil(1)).resolves.toEqual({
      items: [
        {
          source: CatalogSource.Ticketmaster,
          externalId: attraction.id,
          category: EventCategory.Show,
          title: attraction.name,
          description: undefined,
          imageUrl: 'https://s1.ticketm.net/system.jpg',
          genres: ['Music', 'Metal'],
        },
      ],
      page: 1,
      hasMore: true,
    });

    const requestedUrl = new URL(String(fetchMock.mock.calls[0][0]));
    expect(requestedUrl.pathname).toBe('/discovery/v2/events.json');
    expect(requestedUrl.searchParams.get('countryCode')).toBe('BR');
    expect(requestedUrl.searchParams.get('classificationName')).toBe('music');
    expect(requestedUrl.searchParams.get('sort')).toBe('relevance,desc');
    expect(requestedUrl.searchParams.get('size')).toBe('10');
    expect(requestedUrl.searchParams.get('page')).toBe('0');
  });

  it('recarrega uma Attraction por ID e usa additionalInfo como descrição disponível', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        id: 'K8vZ917Gku7',
        name: 'Florence + The Machine',
        additionalInfo: '  Informações adicionais.  ',
        images: [{ url: 'javascript:invalid', width: 100, height: 100 }],
        classifications: [{ genre: { id: 'rock', name: 'Rock' } }],
      }),
    );

    await expect(
      new TicketmasterCatalogProvider().findByExternalId('K8vZ917Gku7'),
    ).resolves.toEqual({
      source: CatalogSource.Ticketmaster,
      externalId: 'K8vZ917Gku7',
      category: EventCategory.Show,
      title: 'Florence + The Machine',
      description: 'Informações adicionais.',
      imageUrl: undefined,
      genres: ['Rock'],
    });
    expect(new URL(String(fetchMock.mock.calls[0][0])).pathname).toBe(
      '/discovery/v2/attractions/K8vZ917Gku7.json',
    );
  });

  it('retorna null quando a Attraction não existe ou a identidade é inválida', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}, 404));
    const provider = new TicketmasterCatalogProvider();

    await expect(provider.findByExternalId('K8vZ917Unknown')).resolves.toBeNull();
    await expect(provider.findByExternalId('../invalid')).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('normaliza timeout como erro estável de catálogo', async () => {
    fetchMock.mockRejectedValueOnce(
      new DOMException('Ticketmaster apikey=provider-secret', 'TimeoutError'),
    );

    const error = await new TicketmasterCatalogProvider()
      .search('Show', 1)
      .catch((cause: unknown) => Promise.resolve(cause));

    expect(error).toBeInstanceOf(CatalogTimeoutError);
    expect((error as CatalogTimeoutError).getResponse()).toEqual({
      statusCode: 504,
      code: 'CATALOG_TIMEOUT',
      message: 'Catálogo externo excedeu o tempo de resposta',
    });
  });

  it.each([429, 500, 503])(
    'normaliza status externo %s como catálogo indisponível',
    async (status) => {
      fetchMock.mockResolvedValueOnce(
        new Response('provider-secret-body', {
          status,
          headers: {
            'Retry-After': 'provider-secret-header',
            'Content-Type': 'text/plain',
          },
        }),
      );

      const error = await new TicketmasterCatalogProvider()
        .search('Show', 1)
        .catch((cause: unknown) => Promise.resolve(cause));

      expect(error).toBeInstanceOf(CatalogUnavailableError);
      expect((error as CatalogUnavailableError).getResponse()).toEqual({
        statusCode: 502,
        code: 'CATALOG_UNAVAILABLE',
        message: 'Catálogo externo indisponível',
      });
    },
  );

  it('rejeita payload incompatível como catálogo indisponível', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ page: 'invalid' }));
    await expect(new TicketmasterCatalogProvider().search('Show', 1)).rejects.toThrow(
      CatalogUnavailableError,
    );
  });
});
