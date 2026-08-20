import { z } from 'zod';

export const loginSchema = z.object({
  email: z
    .email({ message: 'E-mail inválido' })
    .trim()
    .toLowerCase()
    .max(320, { message: 'E-mail inválido' }),
  password: z.string().min(1, { message: 'Senha é obrigatória' }),
});

export type LoginFormValues = z.infer<typeof loginSchema>;
