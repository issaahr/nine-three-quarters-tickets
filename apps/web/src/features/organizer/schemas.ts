import { z } from 'zod';

import { EventCategory } from '../events/types';

const eventFields = {
  venueId: z.uuid('Selecione um local'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Informe uma data válida'),
  time: z.string().regex(/^\d{2}:\d{2}$/, 'Informe um horário válido'),
  priceCents: z
    .number({ error: 'Informe um preço válido' })
    .int('Informe um preço válido')
    .min(0, 'Preço não pode ser negativo')
    .max(100_000_000, 'Preço excede o limite permitido'),
};

const createEventFormSchema = z.object({
  ...eventFields,
  capacity: z
    .number({ error: 'Informe uma capacidade válida' })
    .int('Informe uma capacidade inteira')
    .min(1, 'Capacidade deve ser maior ou igual a 1')
    .max(2_147_483_647, 'Capacidade excede o limite permitido')
    .optional(),
});

export type CreateEventFormValues = z.infer<typeof createEventFormSchema>;

/**
 * Aplica a capacidade somente ao formulário de SHOW, preservando o contrato SEATED de MOVIE.
 */
export function getCreateEventSchema(
  category: EventCategory,
): z.ZodType<CreateEventFormValues, CreateEventFormValues> {
  return createEventFormSchema.superRefine((values, context) => {
    if (category === EventCategory.Show && values.capacity === undefined) {
      context.addIssue({
        code: 'custom',
        path: ['capacity'],
        message: 'Informe uma capacidade válida',
      });
    }
  });
}
