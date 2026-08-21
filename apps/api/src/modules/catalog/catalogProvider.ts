import { CatalogItem } from './catalogItem';
import { CatalogPage } from './catalogPage';
import { CatalogSource } from './catalogSource.enum';

/**
 * Fronteira para fontes externas de conteúdo.
 *
 * Implementações fornecem somente metadados normalizados. Preço, horário,
 * disponibilidade e inventário permanecem sob autoridade da aplicação.
 */
export interface CatalogProvider {
  readonly source: CatalogSource;

  /**
   * Pesquisa conteúdo usando uma consulta já validada pelo fluxo consumidor.
   *
   * @param query - Texto normalizado que será interpretado pelo provider externo.
   * @param page - Página externa solicitada, iniciada em um.
   * @returns Página de itens normalizados e indicação de continuidade.
   */
  search(query: string, page: number): Promise<CatalogPage>;

  /**
   * Lista filmes populares para preencher a descoberta inicial do organizador.
   *
   * @param page - Página externa solicitada, iniciada em um.
   * @returns Página de itens normalizados e indicação de continuidade.
   */
  listPopular(page: number): Promise<CatalogPage>;

  /**
   * Recupera novamente o conteúdo pela identidade externa para que a API não
   * confie em metadados de catálogo enviados pelo frontend ao criar um Event.
   *
   * @param externalId - Identidade atribuída pela fonte indicada em `source`.
   * @returns Item normalizado ou `null` quando a identidade não existe na fonte.
   */
  findByExternalId(externalId: string): Promise<CatalogItem | null>;
}
