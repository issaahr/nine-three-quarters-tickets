import { CatalogItem } from './catalogItem';
import { CatalogSource } from './catalogSource.enum';

/**
 * Fronteira para fontes externas de conteúdo.
 *
 * Implementações fornecem somente metadados normalizados. Preço, horário,
 * disponibilidade e inventário permanecem sob autoridade da aplicação.
 */
export interface CatalogProvider {
  readonly source: CatalogSource;

  /** Pesquisa conteúdo usando uma consulta já validada pelo fluxo consumidor. */
  search(query: string): Promise<CatalogItem[]>;

  /**
   * Recupera novamente o conteúdo pela identidade externa para que a API não
   * confie em metadados de catálogo enviados pelo frontend ao criar um Event.
   */
  findByExternalId(externalId: string): Promise<CatalogItem | null>;
}
