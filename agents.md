# AGENTS.md

## Project

9¾ Tickets is a full-stack ticketing platform for movies and shows.

Canonical project documentation:

- `docs/product-scope.md` — product behavior and V1 boundaries.
- `docs/application-scope.md` — technical scope, domain model, concurrency rules and transactional invariants.
- `docs/architecture.md` — application structure and module boundaries.
- `docs/technical-decisions.md` — accepted technical decisions.
- `docs/adr/` — architectural decision records.

Read the relevant documentation before implementing an issue.

---

## Stack

- React
- Vite
- TypeScript
- TanStack Query
- NestJS
- PostgreSQL
- TypeORM
- Socket.IO
- Docker Compose

---

## Architecture guardrails

Use a modular monolith.

Prefer direct module collaboration when it keeps the flow clear.

Introduce ports primarily for external or volatile boundaries, such as catalog providers and payment gateways.

Do not introduce abstractions solely to anticipate hypothetical future requirements.

In particular:

- PostgreSQL is the authority for transactional invariants.
- Application-level read-then-write checks alone are insufficient for concurrency-sensitive operations.
- Realtime is UX only and never transaction authority.
- TMDb and Ticketmaster provide catalog content, never local inventory.
- Time-based correctness must rely on persisted backend timestamps, not browser timers, tab lifecycle events, or in-memory timers.

Do not introduce `EventSector`, grouped sessions, generic inventory abstractions, generic repository layers, internal event buses, microservices, or distributed infrastructure unless an issue explicitly changes the documented scope.

For complete product and technical rules, read the canonical documentation instead of inferring them from this file.

---

## Implementation discipline

Implement the smallest change that satisfies the issue acceptance criteria and preserves documented invariants.

Keep changes scoped to the current issue.

Do not refactor unrelated code unless required for correctness or to complete the requested change.

Do not add dependencies without a concrete current requirement.

Prefer explicit, testable code over architectural ceremony.

Do not create interfaces, repositories, strategies, use-case layers, or other abstractions by default.

---

## TypeORM and persistence

Use TypeORM with the Data Mapper approach.

Do not use Active Record patterns such as entity `.save()` methods.

Use TypeORM `Repository<T>` directly when it is sufficient.

Introduce custom persistence classes only when they add meaningful persistence behavior, such as:

- conditional writes;
- locking;
- complex QueryBuilder logic;
- transactional inventory operations;
- repeated semantic persistence queries.

Do not wrap TypeORM repositories merely to rename or delegate existing repository methods.

Do not introduce a generic `BaseRepository`.

For transactional operations:

- keep transaction boundaries explicit;
- use the transaction `EntityManager`;
- obtain repositories from that transaction manager;
- do not mix global repositories into an active transaction;
- do not keep a database transaction open while calling an external provider or payment gateway.

---

## Database migrations

Schema changes must be accompanied by a TypeORM migration.

Do not use TypeORM `synchronize` as a substitute for migrations.

Do not modify an existing committed migration unless the issue explicitly requires rewriting migration history and it is known to be safe.

Prefer creating a new migration when evolving an existing schema.

Database constraints that protect domain invariants should be represented explicitly in migrations.

Destructive schema changes must be explicit and must account for existing data.

Changes such as dropping columns, changing column types, tightening nullability, or adding restrictive constraints must consider data migration or cleanup before enforcement.

---

## Environment configuration

Environment variables are the source of truth for runtime configuration.

Do not hardcode environment-specific values directly in application code.

Do not provide fallback values for required environment variables.

Avoid patterns such as:

`process.env.JWT_SECRET ?? 'development-secret'`

or:

`process.env.DATABASE_URL || 'postgres://localhost/...'`

Required environment variables must be validated during application startup.

If a required variable is missing or invalid, fail fast with a clear configuration error.

Do not silently substitute defaults.

Local development and tests must provide their required configuration explicitly.

Example environment files may document required variable names but must not contain real secrets.

Never commit credentials or secrets.

---

## API contracts

HTTP input DTOs must use runtime validation.

Do not expose TypeORM entities directly as HTTP response contracts.

Response contracts should expose only the fields required by the use case.

Do not trust client-provided authoritative domain values such as price, ownership, role, inventory state, payment state, or Ticket state.

The backend must derive or validate authoritative values.

---

## Endpoint documentation

Public API endpoints should be documented using NestJS Swagger conventions.

Keep controllers focused on routing and orchestration.

Do not fill controllers with large blocks of Swagger decorators.

When endpoint documentation requires multiple decorators, compose them into dedicated decorators using NestJS `applyDecorators`.

Prefer module-level files such as:

`reservations.swagger.ts`

with endpoint decorators such as:

`ApiCreateReservation()`

`ApiCancelReservation()`

Controllers should remain readable and use the composed decorator instead of repeating many Swagger decorators directly above each route.

Document meaningful request, response, authorization, and domain error states.

Do not duplicate information already represented accurately by DTO metadata.

Do not create large amounts of repetitive Swagger configuration merely for completeness.

---

## TSDoc

Use TSDoc when it adds information that is not obvious from the type signature or implementation.

Good candidates include:

- public abstractions and ports;
- concurrency-sensitive operations;
- transactional assumptions;
- security-sensitive helpers;
- reusable utilities with important preconditions or side effects;
- non-obvious domain behavior.

Prefer documenting intent, invariants, constraints, and reasons.

Do not add comments that merely restate the code.

---

## Security and authority

Authentication and authorization must be enforced by the backend.

Frontend role checks are UX only.

Do not store authentication tokens in `localStorage`.

Do not trust frontend state as proof of inventory, payment, Ticket validity, or authorization.

Critical transactional guarantees must remain valid even when:

- two requests execute concurrently;
- the frontend is stale;
- a user double-submits;
- WebSocket delivery fails;
- the page is reloaded.

---

## Testing

Tests should target risk rather than line coverage.

Database concurrency and transactional invariants must be tested against PostgreSQL where applicable.

Do not rely on mocked repositories to prove:

- locking;
- constraints;
- transaction behavior;
- race-condition safety.

When an issue changes a critical transactional flow, add or update tests covering the relevant invariant.

Unit tests remain appropriate for pure rules and deterministic helpers.

See `docs/application-scope.md` for the complete list of critical scenarios.

---

## Working with an issue

Before implementing:

1. Read the issue and its acceptance criteria.
2. Read the relevant sections of `docs/product-scope.md` and `docs/application-scope.md`.
3. Check architecture documents, technical decisions, and ADRs when applicable.
4. Identify the invariants affected by the change.
5. Implement the smallest correct change.
6. Add or update tests for the relevant risk.
7. Update documentation only when the issue explicitly requires it or genuinely changes documented behavior.

---

## Completion criteria

An implementation is not complete until:

- the issue acceptance criteria are satisfied;
- affected invariants remain enforced;
- relevant tests pass;
- PostgreSQL-backed tests are used where database behavior or concurrency is involved;
- migrations are included for schema changes;
- required environment configuration is documented and validated;
- no out-of-scope functionality was introduced;
- unrelated files were not changed without a concrete reason.

---

## Scope and decision conflicts

Product and application decisions documented in `docs/product-scope.md`, `docs/application-scope.md`, architecture documents, ADRs, and technical decisions are authoritative for the V1 scope.

Do not modify product scope, application scope, architecture documents, ADRs, or technical decisions as part of an implementation unless the issue explicitly requests a documentation or decision change.

If an implementation request appears to conflict with a documented decision:

- do not silently reinterpret the scope;
- do not modify documentation to make the implementation fit;
- surface the conflict;
- prefer the documented decision until it is explicitly changed.
