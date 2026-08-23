import { Button } from '../../../components/ui/button';
import { EventCategory } from '../types';

export const allCategoriesValue = 'ALL';

interface EventCategoryControlProps {
  category: EventCategory | typeof allCategoriesValue;
  onChange: (category: EventCategory | typeof allCategoriesValue) => void;
}

const categories = [
  { label: 'Todos', value: allCategoriesValue },
  { label: 'Filmes', value: EventCategory.Movie },
  { label: 'Shows', value: EventCategory.Show },
] as const;

/** Destaca o conjunto principal de Events antes dos filtros de refinamento. */
export function EventCategoryControl({ category, onChange }: EventCategoryControlProps) {
  return (
    <div
      className="grid w-full grid-cols-3 gap-1.5 sm:inline-grid sm:w-auto"
      role="group"
      aria-label="Categoria"
    >
      {categories.map(({ label, value }) => {
        const isSelected = category === value;

        return (
          <Button
            key={value}
            type="button"
            variant={isSelected ? 'default' : 'outline'}
            aria-pressed={isSelected}
            onClick={() => onChange(value)}
            className="h-10 w-full rounded-[2px] px-3 text-xs sm:w-auto sm:text-sm"
          >
            {label}
          </Button>
        );
      })}
    </div>
  );
}
