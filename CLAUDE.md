# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Bun monorepo for **Gestione Casa** (a household-expense tracker), migrated from the legacy Angular (`gc-frontend`) + Koa/TypeORM (`gc-server`) stack. Bun workspaces:

- `apps/api` — [Elysia](https://elysiajs.com) HTTP API + [Drizzle ORM](https://orm.drizzle.team) on PostgreSQL (port 5000).
- `apps/web` — React 19 SPA bundled by **Bun's HTML bundler** (not Vite), TanStack Router + Query (port 3000).
- `packages/shared-types` — [TypeBox](https://github.com/sinclairzx81/typebox) schemas shared by both apps.

Runtime is **Bun** everywhere (pinned to `1.3.14` in CI) — use `bun`, never npm/node.

## Commands

Run from the repo root unless noted.

- `bun install` — install all workspaces (`--frozen-lockfile` in CI).
- `bun run lint` — `prettier --check .` (see `.prettierignore`: skips `*.md`, `docs`, `bun.lock`). Use `bunx prettier --write .` to fix.
- `bun run typecheck` — `tsc --noEmit` across every workspace (`--filter '*'`).
- `bun run test` — runs `apps/api` + `packages/shared-types` (`bun test`) then `apps/web` (happy-dom).
- **Dev servers** (start API first): `bun run --filter '@gc/api' dev` (port 5000, `--watch`), then `bun run --filter '@gc/web' dev` (port 3000). Or `cd` into the app and `bun run dev`.
- **db:pull** — `bun run --filter '@gc/api' db:pull` regenerates `apps/api/src/db/schema.ts` from a live DB (drizzle-kit).

### Running tests

API/shared-types tests hit a **real Postgres** and require env vars set inline (root `.env` is not auto-loaded when running from root cwd):

```bash
DATABASE_URL=postgres://<user>:<pw>@localhost:5432/<db> JWT_SECRET=x bun test apps/api/test/utente.test.ts
```

- ⚠️ `apps/api/test/setup.ts` (preloaded via root `bunfig.toml` `[test]`) **TRUNCATEs the `gc` schema** on `resetDb()` — point `DATABASE_URL` at a disposable test DB, **never the dev DB**. It also creates the schema idempotently and exposes `resetDb()` / `seedFixtures()`.
- Web tests: `bun run --filter '@gc/web' test` (preloads `apps/web/happydom.ts` for a DOM).

## Configuration (strict convention)

- **All runtime config lives in per-app `.env`** (`apps/{api,web}/.env`), gitignored and auto-loaded by Bun from each app's cwd. **Never hardcode config in source** (no default URLs/ports/secrets) — read from `process.env` and validate with the `required()` helper in `apps/api/src/env.ts`. Committed `.env.example` files list the required vars.
  - `apps/api`: `DATABASE_URL`, `JWT_SECRET`, `CORS_ORIGIN` (+ optional `PORT`, `COOKIE_SECURE`, `COOKIE_DOMAIN`).
  - `apps/web`: `PUBLIC_API_URL`.
- **Frontend env vars must be prefixed `PUBLIC_*`.** Bun inlines only those into the browser bundle at build time via `apps/web/bunfig.toml` (`[serve.static] env = "PUBLIC_*"`). `process` does not exist in the browser, so referencing an unset or unprefixed `process.env.*` throws `ReferenceError: process is not defined`.

## Architecture

**End-to-end type safety is the backbone.** `apps/web/src/api/client.ts` builds an [Eden Treaty](https://elysiajs.com/eden/overview.html) client typed against `App` imported from `@gc/api` (`treaty<App>(...)`). The frontend is therefore statically checked against the backend's actual routes — **changing an API route's path, params, body, or response reshapes the web client's types**. Request/response shapes come from `@gc/shared-types` TypeBox schemas, which Elysia uses for runtime validation *and* which give the web app its types. Change a schema in one place; both sides follow.

**API vertical slices.** Each domain folder under `apps/api/src` (`andamento`, `tipo-spesa`, `utente`, `statistiche`) is three files wired by factory functions with dependency injection:

- `*.routes.ts` — an Elysia instance with a `prefix`; declares `body`/`params`/`response` validation and `.use(authPlugin)` to require auth. Composed in `app.ts` via `buildApp()`.
- `*.service.ts` — `createXService(repo)` business logic.
- `*.repository.ts` — `createXRepository(db)` Drizzle queries; coerces PG `numeric`→number and `date`→`YYYY-MM-DD` (see comments in `db/schema.ts`).

Prefer this factory/closure style (no classes) for new code; the only classes are the error types in `errors.ts`, needed for Elysia's `.error()` mapping.

**Auth is cookie-based** (not Bearer tokens). Login issues short-lived `access` (15m) + long-lived `refresh` (14d) JWTs (`@elysiajs/jwt`) set as **httpOnly cookies**; refresh tokens are persisted in `gc.token` and **single-use (rotated)** on `/utente/refresh`. `auth/auth.plugin.ts` derives the current `utente` from the access cookie and throws `AuthError` (→ 401) if invalid. The web client sends cookies with `credentials: 'include'`. Only `/utente/login` and `/utente` (register) are unauthenticated.

**Errors** are centralized: `withErrorHandling` in `errors.ts` maps `BadRequestError`→400, `NotFoundError`→404, `AuthError`→401, Elysia `VALIDATION`→400.

**Database.** Drizzle with a dedicated `gc` PostgreSQL schema (`db/schema.ts`, `pgSchema('gc')`). Entities and domain vocabulary are **Italian**: `Andamento` (expense entry), `TipoSpesa` (expense category), `Utente` (user), `Token`. Connection via `drizzle-orm/bun-sql` (`db/client.ts`); TLS is driven by the URL (`?sslmode=require` in prod).

- **Hardcoded expense-category IDs are a load-bearing coupling:** statistics group by `1=spesa, 2=carburante, 3=bolletta, 7=casa`, and the web `/statistiche/*` views mirror exactly that set. Changing a category ID means editing the API aggregation and the web dashboards together.

**Frontend.** `main.tsx` → `routes/router.tsx` builds a **code-based** TanStack Router tree (no file-based plugin, for Bun-bundler compatibility) with a typed `Register` module augmentation. Protected routes use `requireAuth(queryClient)` in `beforeLoad`. Data via TanStack Query (`query/`), forms via react-hook-form + `@hookform/resolvers`, UI via react-bootstrap/bootswatch, toasts via sonner.

## Conventions

- TypeScript strict (`tsconfig.base.json`: `noUncheckedIndexedAccess`, `verbatimModuleSyntax`, `moduleResolution: bundler`). Prettier: `singleQuote`, `trailingComma: all`, `printWidth: 100`.
- Named exports, relative imports, arrow functions, English comments/code. Keep the API's shared REST surface and Italian entity names in sync with the legacy repos during the migration.
- CI (`.github/workflows/ci.yml`) runs `lint` → `typecheck` → `test` on push/PR to `master` against a Postgres 16 service.
