import { z } from 'zod';

export const createMovieEventSchema = z.object({
  venueId: z.uuid('Selecione um local'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Informe uma data válida'),
  time: z.string().regex(/^\d{2}:\d{2}$/, 'Informe um horário válido'),
  priceCents: z
    .number({ error: 'Informe um preço válido' })
    .int('Informe um preço válido')
    .min(0, 'Preço não pode ser negativo'),
});

export type CreateMovieEventFormValues = z.infer<typeof createMovieEventSchema>;
