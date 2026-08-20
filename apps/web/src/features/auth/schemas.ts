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

export const signupSchema = z
  .object({
    email: z
      .email({ message: 'E-mail inválido' })
      .trim()
      .toLowerCase()
      .max(320, { message: 'E-mail inválido' }),
    password: z
      .string()
      .refine((password) => Array.from(password).length >= 8, {
        message: 'A senha deve ter pelo menos 8 caracteres',
      })
      .refine((password) => new TextEncoder().encode(password).length <= 72, {
        message: 'A senha deve ter no máximo 72 bytes',
      }),
    passwordConfirmation: z.string().min(1, { message: 'Confirme sua senha' }),
  })
  .refine(({ password, passwordConfirmation }) => password === passwordConfirmation, {
    message: 'As senhas não coincidem',
    path: ['passwordConfirmation'],
  });

export type SignupFormValues = z.infer<typeof signupSchema>;
