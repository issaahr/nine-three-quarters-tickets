import { z } from 'zod';

export const cardPaymentSchema = z.object({
  cardNumber: z
    .string()
    .refine((value) => /^\d{13,19}$/.test(value.replace(/\s+/g, '')), 'Número do cartão inválido')
    .transform((value) => value.replace(/\s+/g, '')),
  cardholderName: z.string().trim().min(2, 'Informe o nome no cartão').max(120),
  expiry: z.string().regex(/^(0[1-9]|1[0-2])\/\d{2}$/, 'Validade inválida'),
  cvv: z.string().regex(/^\d{3,4}$/, 'CVV inválido'),
});

export type CardPaymentFormValues = z.input<typeof cardPaymentSchema>;
