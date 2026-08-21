import { CatalogItem } from './catalogItem';

// Página normalizada sem expor metadados específicos do provider externo.
export interface CatalogPage {
  readonly items: CatalogItem[];
  readonly page: number;
  readonly hasMore: boolean;
}
