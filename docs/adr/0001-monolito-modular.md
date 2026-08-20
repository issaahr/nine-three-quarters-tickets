# ADR 0001 — Monólito modular

- Status: aceito
- Data: 2026-08-20

## Contexto

A V1 possui múltiplos domínios relacionados e invariantes transacionais fortes, mas será desenvolvida e operada como uma única API. Microservices, mensageria e infraestrutura distribuída aumentariam o custo de coordenação sem resolver uma necessidade atual.

Também é necessário evitar que a modularização interna produza camadas e interfaces que apenas deleguem operações existentes do TypeORM.

## Decisão

A API será um monólito modular NestJS.

- Cada domínio mantém entidades, contratos, regras e erros próximos.
- Módulos internos colaboram diretamente quando a dependência é clara.
- `Repository<T>` do TypeORM é usado diretamente para persistência comum.
- Ports são introduzidos prioritariamente para fronteiras externas ou voláteis, como catálogos e pagamentos.
- Transações permanecem explícitas e usam o `EntityManager` transacional.
- PostgreSQL é a autoridade dos invariantes concorrentes.

## Consequências

- Deploy, observabilidade e transações permanecem simples na V1.
- Limites de módulo precisam ser preservados por organização e revisão, não por isolamento de processos.
- Uma extração futura de serviço exigirá necessidade operacional comprovada.
- Interfaces e classes intermediárias não são proibidas, mas precisam acrescentar contrato, comportamento ou isolamento concreto.
