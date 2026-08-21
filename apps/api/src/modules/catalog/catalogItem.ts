import { EventCategory } from '../events/eventCategory.enum';
import { CatalogSource } from './catalogSource.enum';

/** Conteúdo transitório normalizado antes da criação do snapshot local de um Event. */
export interface CatalogItem {
  readonly source: CatalogSource;
  readonly externalId: string;
  readonly category: EventCategory;
  readonly title: string;
  readonly description?: string;
  readonly imageUrl?: string;
  readonly genres: string[];
}
