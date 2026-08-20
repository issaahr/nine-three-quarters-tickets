# ADR 0003 — Autenticação JWT em cookie HttpOnly

- Status: aceito
- Data: 2026-08-20

## Contexto

A V1 precisa autenticar CUSTOMER, ORGANIZER e GATE em uma aplicação web separada da API. O token não deve ficar acessível ao JavaScript do navegador, e refresh token ou sessão persistida no servidor aumentariam o escopo da fundação.

Papéis controlam operações sensíveis e não podem depender de estado ou roteamento do frontend.

## Decisão

- A API emite um access token JWT HS256 de curta duração.
- O token contém `sub` e `role` e é enviado exclusivamente por cookie HttpOnly.
- Não existe refresh token nem armazenamento em `localStorage`.
- `GET /auth/session` expõe somente `id` e `role`; ausência ou invalidade do cookie retorna `204`.
- A API valida a role do token e aplica autenticação e autorização por guards.
- Verificações de papel no frontend servem somente para navegação e apresentação.
- Logout expira o cookie no navegador.

## Consequências

- Scripts executados no frontend não conseguem ler o token diretamente.
- Logout não revoga um JWT já emitido no servidor; a validade termina pela expiração configurada.
- Ao expirar a sessão, o usuário autentica novamente.
- CORS, `SameSite`, `Secure` e proteção contra CSRF precisam permanecer coerentes com a topologia real do deploy.
- Mudanças de papel só são refletidas em tokens emitidos posteriormente.
