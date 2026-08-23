# AGENTS.md

## Project

9¾ Tickets is a full-stack ticketing platform for movies and shows.

Canonical project documentation:

- `docs/product-scope.md` — product behavior and V1 boundaries.
- `docs/application-scope.md` — technical scope, domain model, concurrency rules and transactional invariants.
- `docs/architecture.md` — application structure and module boundaries.
- `docs/technical-decisions.md` — accepted technical decisions.
- `docs/adr/` — architectural decision records.
- `docs/ui-desicions.md` - ui decisions.

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

The API and Web are independent applications. Keep their `package.json`, lockfile, dependencies, scripts, and TypeScript configuration separate. Do not introduce shared workspace packages or cross-application dependency coupling unless a concrete issue requires it.

Docker Compose coordinates the applications together in local development and deployment workflows. Root-level setup must not recreate that coordination with a shared package or orchestration script.

The supported development hot-reload workflow is Linux/WSL-oriented. Do not add Windows-specific polling or watcher configuration unless an issue explicitly requires cross-platform support.

Repository text files use LF line endings by default; preserve the `.gitattributes` policy when adding or generating files.

---

## Implementation discipline

Implement the smallest change that satisfies the issue acceptance criteria and preserves documented invariants.

Keep changes scoped to the current issue.

Do not refactor unrelated code unless required for correctness or to complete the requested change.

Do not add dependencies without a concrete current requirement.

Prefer explicit, testable code over architectural ceremony.

Do not introduce interfaces, repositories, strategies, use-case layers, or other abstractions solely by default or for hypothetical future requirements.

However, abstractions are not forbidden. Introduce them when they represent a real current responsibility, improve cohesion, reduce coupling, enable meaningful reuse, or are required by an existing architectural boundary.

When a reusable domain contract is justified, keep its interfaces in a dedicated `*.interfaces.ts` file, even when the file contains only one interface. Component-local `Props` contracts may remain next to their component.

Use enums for finite domain values such as roles, statuses, categories, and modes. Do not scatter authoritative domain strings through entities, services, controllers, or UI logic.

Do not sacrifice code organization merely to avoid creating an abstraction or additional file.

---

## Code organization and reuse

Keep code organized around clear responsibilities and cohesive modules.

When the current implementation becomes difficult to understand, test, reuse, or maintain, the agent may introduce appropriate abstractions or split responsibilities to improve the existing design.

Reasonable refactoring includes:

- extracting a cohesive piece of logic into a dedicated function, class, or module;
- separating responsibilities that have become unnecessarily coupled;
- extracting reusable domain or application contracts;
- introducing a service, strategy, adapter, or other abstraction when it represents a real current responsibility;
- moving code to a more appropriate module when its current location violates module boundaries;
- extracting shared utilities when the same behavior is genuinely reused;
- splitting oversized files or classes when doing so improves cohesion and readability.

Prefer abstractions that represent an existing concept in the domain or application rather than abstractions created merely to make the code look more generic.

Do not keep unrelated responsibilities together merely to avoid creating another file or abstraction.

At the same time, do not over-engineer simple code. A small piece of logic should remain simple when extracting it would add indirection without improving clarity.

### Reuse existing libraries and platform capabilities

Before implementing infrastructure, utilities, algorithms, or framework behavior manually, check whether the project already has a suitable dependency or whether the current stack provides the required capability.

Prefer:

- existing project utilities over duplicating equivalent logic;
- framework-provided features over reimplementing framework behavior;
- established libraries over custom implementations of non-domain functionality;
- standard library APIs over custom implementations when they are sufficient;
- TypeORM, NestJS, PostgreSQL, Socket.IO, TanStack Query, and other existing project dependencies when they already solve the problem appropriately.

Do not reinvent common functionality such as validation, parsing, date handling, serialization, cryptographic operations, HTTP concerns, query utilities, or other infrastructure concerns when a suitable established solution is already available.

Before adding a new dependency, evaluate whether:

1. the project already has a dependency that solves the problem;
2. the framework or standard library already provides the required functionality;
3. implementing it locally is genuinely simpler and more appropriate;
4. the dependency is mature, maintained, and proportionate to the problem.

Do not add a dependency for trivial functionality that is clearer and safer to implement locally.

Do not implement a custom replacement for an established library merely to avoid adding a dependency.

Dependency additions must have a concrete current requirement and should be justified by the problem being solved, not by hypothetical future reuse.

### Refactoring during implementation

If implementing the requested issue reveals a clear organizational problem in the affected code, the agent may perform a small, local refactoring when it:

- directly improves the code being changed;
- preserves existing behavior;
- reduces duplication or coupling;
- makes the requested change simpler or safer;
- does not expand the issue into an unrelated architectural rewrite.

Do not use the issue as an excuse for broad unrelated refactoring.

When a small refactoring is necessary to keep the implementation coherent, prefer doing it rather than adding more code to an already inappropriate structure.

---

## TypeORM and persistence

Use TypeORM with the Data Mapper approach.

Do not use Active Record patterns such as entity `.save()` methods.

Use TypeORM `Repository<T>` directly when it is sufficient.

Do not create a custom repository merely to wrap or rename operations that TypeORM already provides, such as `findOne`, `find`, `findBy`, `exists`, or equivalent repository methods.

Introduce custom persistence classes only when they add meaningful persistence behavior, such as:

- conditional writes;
- locking;
- complex QueryBuilder logic;
- transactional inventory operations;
- repeated semantic persistence queries;
- persistence operations that represent a meaningful domain/application concept.

Do not wrap TypeORM repositories merely to rename or delegate existing repository methods.

Do not introduce a generic `BaseRepository`.

Persistence logic should live at the persistence boundary when it represents a meaningful database operation.

Services may use simple repository operations directly when that keeps the code clear.

When persistence logic becomes complex, query-specific, locking-sensitive, transactional, or reusable, move it into an appropriate custom repository or persistence class rather than accumulating database-specific logic in the service.

Do not place large SQL statements or complex QueryBuilder expressions directly in services merely to avoid creating a persistence abstraction.

Do not move business rules into repositories merely to make services smaller. Repositories should encapsulate persistence concerns; services should coordinate application behavior and enforce application-level rules.

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

Generate migrations with the configured TypeORM commands. Do not hand-randomize migration timestamps or class names; migration ordering must remain deterministic.

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

The Compose environment flow should use the project environment file configuration (`env_file`) rather than redeclaring each variable inline. Fixed development ports may remain declared in Compose.

Demo-only credentials may be documented when they are intentionally public for evaluator access and are isolated from production configuration. They must never be reused or treated as production secrets.

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

## TSDoc and comments

Use comments only when they add information that cannot be reasonably inferred from the code itself. Do not add comments that merely describe what the code does.

### Method return types

Explicitly type the parameters and return type of methods where the project's conventions require a stable method contract.

In particular:

- Always explicitly type parameters and return types of repository methods.
- Always explicitly type parameters and return types of service methods when they define a reusable or meaningful contract.
- Do not add an explicit return type to controllers when the return type is already clear from the framework/decorators and implementation.
- Do not add redundant types when TypeScript can infer a trivial local value.

This rule is independent from TSDoc: a method can require explicit parameter/return types without requiring documentation.

### Comments

Use `//` for short contextual comments, such as a brief explanation of a decision, workaround, constraint, or non-obvious implementation detail.

Use a multiline block comment when an explanation is needed but the code element does not require TSDoc.

Example:

/\*

- Explanation of a non-obvious implementation detail.
  \*/

Do not use `/** ... */` merely because the comment spans multiple lines.

### TSDoc

Use `/** ... */` only for contracts or APIs that benefit from documentation beyond what the code and types already communicate.

Good candidates include:

- public abstractions and ports;
- interfaces whose purpose or contract is not obvious;
- concurrency-sensitive operations;
- transactional assumptions;
- security-sensitive helpers;
- reusable utilities with important preconditions or side effects;
- non-obvious domain behavior.

A method, interface, or other declaration does not automatically require TSDoc just because it is public, exported, or has explicit types.

Prefer documenting:

- intent;
- invariants;
- preconditions and constraints;
- side effects;
- reasons behind non-obvious behavior.

Use `@param` and `@returns` only when they clarify a non-obvious contract. Do not add them mechanically to every documented method.

### Language and format

Write project comments and TSDoc in Portuguese.

Use `//` for short comments, `/* ... */` for multiline explanatory comments, and `/** ... */` for TSDoc.

Do not use TSDoc for simple declarations or methods when their behavior is already obvious from their name, types, and implementation.

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

For implementation work, it is acceptable to defer the full test suite until the end of the change when intermediate execution would add noise; the final validation remains required. Do not expand the issue into an npm vulnerability audit unless explicitly requested.

---

## Working with an issue

Before implementing:

1. Read the issue and its acceptance criteria.
2. Read the relevant sections of `docs/product-scope.md` and `docs/application-scope.md`.
3. Check architecture documents, technical decisions, and ADRs when applicable.
4. Identify the invariants affected by the change.
5. Check whether existing project utilities, dependencies, or framework capabilities already solve part of the problem.
6. Implement the smallest correct change.
7. Add or update tests for the relevant risk.
8. Update documentation only when the issue explicitly requires it or genuinely changes documented behavior.

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

For the public customer experience, the canonical discovery route is `/events`. The catalog may render anonymously; optional session restoration must not block the catalog or turn an expected anonymous session into a console-level application error. Authenticated users should still be redirected to their role area when entering through authentication flows.

---

## Scope and decision conflicts

Product and application decisions documented in `docs/product-scope.md`, `docs/application-scope.md`, architecture documents, ADRs, and technical decisions are authoritative for the V1 scope.

Do not modify product scope, application scope, architecture documents, ADRs, or technical decisions as part of an implementation unless the issue explicitly requests a documentation or decision change.

If an implementation request appears to conflict with a documented decision:

- do not silently reinterpret the scope;
- do not modify documentation to make the implementation fit;
- surface the conflict;
- prefer the documented decision until it is explicitly changed.
