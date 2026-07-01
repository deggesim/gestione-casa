# Phase 1 — Monorepo Scaffold + Backend at Contract Parity — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the `gestione-casa` Bun-workspace monorepo and reimplement the `gc-server` REST API on Elysia + Drizzle (over Bun.sql), byte-for-byte contract-identical to the current Koa/TypeORM server, verified against the same PostgreSQL schema.

**Architecture:** A Bun workspace with `apps/api` (Elysia), `packages/shared-types` (TypeBox DTOs), and a placeholder `apps/web`. The API keeps the *existing* Bearer-JWT auth in this phase (hardening is Phase 2) so the client contract is untouched. Drizzle introspects the existing `gc` schema; the statistics raw SQL is ported verbatim (same CTEs, same hardcoded category-ID sets) and locked down with deterministic characterization tests over seeded fixtures.

**Tech Stack:** Bun, Elysia, `@elysiajs/jwt`, Drizzle ORM (`drizzle-orm/bun-sql`), `drizzle-kit`, `@sinclair/typebox`, `bun:test`, GitHub Actions.

## Global Constraints

- Runtime: **Bun** (latest); Node engines from old repos are irrelevant. TypeScript **strict**.
- Style: **no `class` keyword** — factory functions returning objects (`const createX = (deps) => ({ ... })`). **Arrow functions** only. **Named exports** only. **Relative imports** only (no path aliases across packages except the `@gc/shared-types` workspace package). **English** for all code and comments. Prettier defaults.
- DB schema is **`gc`** (hardcoded, unchanged). Do **not** run `push`/migrations that alter it — introspect only.
- **20 routes and their HTTP status codes must be preserved exactly** (see spec §2.1).
- **Statistics SQL ported VERBATIM.** Exact category-ID sets: monthly default `in (1,2,3,5,7,9,13,16)`, yearly default `in (1,3,7,9,10,13,16)`; single-category IDs spesa=1, carburante=2, bolletta=3, casa=7. Same `date_trunc`/`generate_series`/`right join`/`coalesce(...,0)`, `YYYYMM` (monthly, `limit 48`) / `YYYY` (yearly) output.
- **Auth in this phase stays as-is:** HS256 symmetric JWT from `JWT_SECRET`, 14d expiry, payload `{ id }`, `Authorization: Bearer <token>` header, `/utente/login` returns `{ utente, token }`. (Cookies/refresh = Phase 2.)
- Password hashing via **`Bun.password`** (verifies existing bcrypt hashes). No `bcryptjs`.
- **TLS:** connect with a valid CA (Railway) — **never** `rejectUnauthorized:false`. For local dev/test against a non-TLS Postgres, disable TLS entirely via the connection URL, don't disable verification.
- `VAPID_*` env vars are dropped.
- Branch: `master`. Commit after every task step group.

## File Structure

```
gestione-casa/
├── package.json                      # workspaces root
├── tsconfig.base.json                # shared strict TS config
├── bunfig.toml                       # bun test preload
├── .prettierrc
├── .gitignore
├── .github/workflows/ci.yml
├── packages/shared-types/
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts                  # re-exports
│       ├── interval.ts               # Interval enum + TypeBox schema
│       ├── andamento.ts              # Andamento DTO + schema
│       ├── tipo-spesa.ts             # TipoSpesa DTO + schema
│       ├── utente.ts                 # Utente DTO + schema
│       └── statistica.ts             # Statistica DTO + schema
└── apps/
    ├── web/                          # placeholder in this phase
    │   └── package.json
    └── api/
        ├── package.json
        ├── tsconfig.json
        ├── drizzle.config.ts
        └── src/
            ├── index.ts              # entrypoint: build app + listen
            ├── app.ts                # composes Elysia app (exported for tests)
            ├── env.ts                # typed env access
            ├── db/
            │   ├── client.ts         # Drizzle over Bun.sql
            │   └── schema.ts         # introspected gc schema (curated)
            ├── errors.ts             # custom errors + onError registration
            ├── auth/
            │   └── auth.plugin.ts    # Bearer JWT verify + utente hydration
            ├── tipo-spesa/
            │   ├── tipo-spesa.repository.ts
            │   ├── tipo-spesa.service.ts
            │   └── tipo-spesa.routes.ts
            ├── andamento/
            │   ├── andamento.repository.ts
            │   ├── andamento.service.ts
            │   └── andamento.routes.ts
            ├── utente/
            │   ├── utente.repository.ts
            │   ├── utente.service.ts
            │   └── utente.routes.ts
            └── statistiche/
                ├── statistiche.repository.ts   # VERBATIM SQL
                ├── statistiche.service.ts
                └── statistiche.routes.ts
        └── test/
            ├── setup.ts              # test DB: create gc schema + tables + seed/truncate helpers
            ├── tipo-spesa.test.ts
            ├── andamento.test.ts
            ├── utente.test.ts
            └── statistiche.test.ts   # characterization tests
```

---

### Task 1: Monorepo scaffold

**Files:**
- Create: `package.json`, `tsconfig.base.json`, `bunfig.toml`, `.prettierrc`, `.gitignore`
- Create: `packages/shared-types/package.json`, `apps/api/package.json`, `apps/web/package.json`

**Interfaces:**
- Produces: workspace `@gc/shared-types`, `@gc/api`, `@gc/web`; shared `tsconfig.base.json`.

- [ ] **Step 1: Create root `package.json`**

```json
{
  "name": "gestione-casa",
  "private": true,
  "workspaces": ["apps/*", "packages/*"],
  "scripts": {
    "typecheck": "bun run --filter '*' typecheck",
    "test": "bun test",
    "lint": "prettier --check ."
  },
  "devDependencies": {
    "@types/bun": "latest",
    "prettier": "^3.5.3",
    "typescript": "^5.8.2"
  }
}
```

- [ ] **Step 2: Create `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "strict": true,
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "esModuleInterop": true,
    "skipLibCheck": true,
    "noUncheckedIndexedAccess": true,
    "verbatimModuleSyntax": true
  }
}
```

- [ ] **Step 3: Create `bunfig.toml`, `.prettierrc`, `.gitignore`**

`bunfig.toml` (the `[test] preload` is intentionally NOT added here — the preloaded `setup.ts` does not exist until Task 4; adding it now breaks `bun test` in Tasks 2–3. Task 4 Step 5 adds it):
```toml
# Bun configuration. The test preload is added in Task 4, once apps/api/test/setup.ts exists.
```

`.prettierrc`:
```json
{ "semi": true, "singleQuote": true, "trailingComma": "all", "printWidth": 100 }
```

`.gitignore`:
```
node_modules
dist
*.local
.env
```

- [ ] **Step 4: Create workspace package manifests**

`packages/shared-types/package.json`:
```json
{
  "name": "@gc/shared-types",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "scripts": { "typecheck": "tsc --noEmit" },
  "dependencies": { "@sinclair/typebox": "^0.34.0" }
}
```

`apps/api/package.json`:
```json
{
  "name": "@gc/api",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "bun run --watch src/index.ts",
    "start": "bun run src/index.ts",
    "typecheck": "tsc --noEmit",
    "db:pull": "drizzle-kit pull"
  },
  "dependencies": {
    "@gc/shared-types": "workspace:*",
    "elysia": "^1.3.0",
    "@elysiajs/jwt": "^1.3.0",
    "@elysiajs/cors": "^1.3.0",
    "drizzle-orm": "^0.44.0"
  },
  "devDependencies": { "drizzle-kit": "^0.31.0" }
}
```

`apps/web/package.json` (placeholder):
```json
{
  "name": "@gc/web",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": { "typecheck": "tsc --noEmit || true" }
}
```

- [ ] **Step 5: Install and verify**

Run: `bun install`
Expected: lockfile created, workspaces linked, no errors.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: scaffold Bun-workspace monorepo (api, web, shared-types)"
```

---

### Task 2: `shared-types` — Interval + domain DTOs (TypeBox)

**Files:**
- Create: `packages/shared-types/src/{interval,tipo-spesa,andamento,utente,statistica,index}.ts`
- Create: `packages/shared-types/tsconfig.json`
- Test: `packages/shared-types/src/interval.test.ts`

**Interfaces:**
- Produces: `Interval` enum + `IntervalSchema`; `TipoSpesa`, `Andamento`, `Utente`, `Statistica` types + their TypeBox schemas (`*Schema`); `StatisticaSchema` = `t.Array(t.Object({ name, value }))`.

- [ ] **Step 1: Create `packages/shared-types/tsconfig.json`**

```json
{ "extends": "../../tsconfig.base.json", "include": ["src"] }
```

- [ ] **Step 2: Write the failing test** — `packages/shared-types/src/interval.test.ts`

```ts
import { test, expect } from 'bun:test';
import { Value } from '@sinclair/typebox/value';
import { Interval, IntervalSchema } from './interval';

test('Interval enum matches server values', () => {
  expect(Interval.mese).toBe('M');
  expect(Interval.anno).toBe('Y');
  expect(Interval.tutto).toBe('A');
});

test('IntervalSchema accepts M/Y/A and rejects others', () => {
  expect(Value.Check(IntervalSchema, 'M')).toBe(true);
  expect(Value.Check(IntervalSchema, 'X')).toBe(false);
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `bun test packages/shared-types/src/interval.test.ts`
Expected: FAIL — cannot find module `./interval`.

- [ ] **Step 4: Implement `interval.ts`**

```ts
import { type Static, Type } from '@sinclair/typebox';

export enum Interval {
  mese = 'M',
  anno = 'Y',
  tutto = 'A',
}

export const IntervalSchema = Type.Union([
  Type.Literal('M'),
  Type.Literal('Y'),
  Type.Literal('A'),
]);

export type IntervalValue = Static<typeof IntervalSchema>;
```

- [ ] **Step 5: Implement the domain DTO modules**

`tipo-spesa.ts`:
```ts
import { type Static, Type } from '@sinclair/typebox';

export const TipoSpesaSchema = Type.Object({
  id: Type.Number(),
  descrizione: Type.String(),
});
export type TipoSpesa = Static<typeof TipoSpesaSchema>;
```

`andamento.ts`:
```ts
import { type Static, Type } from '@sinclair/typebox';
import { TipoSpesaSchema } from './tipo-spesa';

export const AndamentoSchema = Type.Object({
  id: Type.Optional(Type.Union([Type.Number(), Type.Null()])),
  giorno: Type.String(), // ISO date (YYYY-MM-DD)
  descrizione: Type.String(),
  costo: Type.Number({ minimum: 0.01 }),
  tipoSpesa: TipoSpesaSchema,
});
export type Andamento = Static<typeof AndamentoSchema>;

// Body accepted on create/update (id optional, tipoSpesa may carry just an id).
export const AndamentoInputSchema = Type.Object({
  id: Type.Optional(Type.Union([Type.Number(), Type.Null()])),
  giorno: Type.String(),
  descrizione: Type.String(),
  costo: Type.Number({ minimum: 0.01 }),
  tipoSpesa: Type.Object({ id: Type.Number() }),
});
export type AndamentoInput = Static<typeof AndamentoInputSchema>;
```

`utente.ts`:
```ts
import { type Static, Type } from '@sinclair/typebox';

export const UtenteSchema = Type.Object({
  id: Type.Optional(Type.Number()),
  email: Type.String(),
});
export type Utente = Static<typeof UtenteSchema>;

export const LoginInputSchema = Type.Object({
  email: Type.String(),
  password: Type.String(),
});
export type LoginInput = Static<typeof LoginInputSchema>;
```

`statistica.ts`:
```ts
import { type Static, Type } from '@sinclair/typebox';

export const StatisticaSchema = Type.Object({
  name: Type.String(),
  value: Type.Number(),
});
export type Statistica = Static<typeof StatisticaSchema>;

export const StatisticheSchema = Type.Array(StatisticaSchema);
```

`index.ts`:
```ts
export * from './interval';
export * from './tipo-spesa';
export * from './andamento';
export * from './utente';
export * from './statistica';
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `bun test packages/shared-types/src/interval.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 7: Commit**

```bash
git add packages/shared-types
git commit -m "feat(shared-types): Interval + domain DTO schemas (TypeBox)"
```

---

### Task 3: API scaffold — env, Drizzle/Bun.sql client, Elysia app, health route

**Files:**
- Create: `apps/api/tsconfig.json`, `apps/api/src/env.ts`, `apps/api/src/db/client.ts`, `apps/api/src/app.ts`, `apps/api/src/index.ts`
- Test: `apps/api/test/health.test.ts`

**Interfaces:**
- Produces: `env` (object with `DATABASE_URL`, `JWT_SECRET`, `PORT`, `CORS_ORIGIN`); `db` (Drizzle instance); `buildApp() => Elysia` (composable, exported for tests); default export in `index.ts` calls `.listen(env.PORT)`.

- [ ] **Step 1: Create `apps/api/tsconfig.json`**

```json
{ "extends": "../../tsconfig.base.json", "include": ["src", "test", "drizzle.config.ts"] }
```

- [ ] **Step 2: Implement `env.ts`**

```ts
const required = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
};

export const env = {
  DATABASE_URL: required('DATABASE_URL'),
  JWT_SECRET: required('JWT_SECRET'),
  PORT: Number(process.env.PORT ?? 5000),
  CORS_ORIGIN: process.env.CORS_ORIGIN ?? '*',
};
```

- [ ] **Step 3: Implement `db/client.ts`**

```ts
import { drizzle } from 'drizzle-orm/bun-sql';
import { env } from '../env';
import * as schema from './schema';

// Bun.sql reads TLS mode from the URL (`?sslmode=require` in prod, none locally).
// Never disable certificate verification — use the provider CA instead.
export const db = drizzle({ connection: { url: env.DATABASE_URL }, schema });
```

- [ ] **Step 4: Create a temporary empty `db/schema.ts`** (filled in Task 4)

```ts
// Populated by Task 4 (introspection). Empty object keeps the client type-valid.
export {};
```

- [ ] **Step 5: Write the failing test** — `apps/api/test/health.test.ts`

```ts
import { test, expect } from 'bun:test';
import { buildApp } from '../src/app';

test('GET /health returns ok', async () => {
  const app = buildApp();
  const res = await app.handle(new Request('http://localhost/health'));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ status: 'ok' });
});
```

- [ ] **Step 6: Run to verify it fails**

Run: `bun test apps/api/test/health.test.ts`
Expected: FAIL — cannot find module `../src/app`.

- [ ] **Step 7: Implement `app.ts` and `index.ts`**

`app.ts`:
```ts
import { Elysia } from 'elysia';
import cors from '@elysiajs/cors';
import { env } from './env';

export const buildApp = () =>
  new Elysia()
    .use(cors({ origin: env.CORS_ORIGIN, credentials: true }))
    .get('/health', () => ({ status: 'ok' }));
```

`index.ts`:
```ts
import { buildApp } from './app';
import { env } from './env';

buildApp().listen(env.PORT);
console.log(`API listening on port ${env.PORT}`);
```

- [ ] **Step 8: Run to verify it passes**

Run: `DATABASE_URL='postgres://x' JWT_SECRET='x' bun test apps/api/test/health.test.ts`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/api
git commit -m "feat(api): Elysia app scaffold with Drizzle/Bun.sql client and health route"
```

---

### Task 4: Drizzle schema for `gc` (introspect + curate) and test DB setup

**Files:**
- Create: `apps/api/drizzle.config.ts`
- Replace: `apps/api/src/db/schema.ts` (with curated introspection output)
- Create: `apps/api/test/setup.ts`

**Interfaces:**
- Produces: `gc` `pgSchema`; tables `tipoSpesa`, `andamento`, `utente`, `token` with typed columns; test helpers `resetDb()` and `seedFixtures()`.

- [ ] **Step 1: Create `drizzle.config.ts`**

```ts
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: { url: process.env.DATABASE_URL! },
  schemaFilter: ['gc'],
  tablesFilter: ['*'],
});
```

- [ ] **Step 2: Introspect the existing DB**

Run: `cd apps/api && DATABASE_URL='<dev db url>' bun run db:pull`
Expected: generates a schema file under `./drizzle`. Use it as the source of truth, then move/curate the table definitions into `src/db/schema.ts` (Step 3). Verify column names/types match the four tables in spec §2.1.

- [ ] **Step 3: Write curated `src/db/schema.ts`** (matches introspection; hand-written here for determinism)

```ts
import { pgSchema, serial, integer, text, numeric, date } from 'drizzle-orm/pg-core';

export const gc = pgSchema('gc');

export const tipoSpesa = gc.table('tipo_spesa', {
  id: serial('id').primaryKey(),
  descrizione: text('descrizione').notNull(),
});

export const andamento = gc.table('andamento', {
  id: serial('id').primaryKey(),
  giorno: date('giorno').notNull(), // string mode (YYYY-MM-DD)
  descrizione: text('descrizione').notNull(),
  costo: numeric('costo').notNull(), // returned as string by pg; coerce in service
  tipoSpesaId: integer('tipo_spesa_id')
    .notNull()
    .references(() => tipoSpesa.id),
});

export const utente = gc.table('utente', {
  id: serial('id').primaryKey(),
  email: text('email').notNull(),
  password: text('password').notNull(),
});

export const token = gc.table('token', {
  id: serial('id').primaryKey(),
  token: text('token').notNull(),
  utenteId: integer('utente_id')
    .notNull()
    .references(() => utente.id),
});
```

- [ ] **Step 4: Implement `test/setup.ts`** (self-contained test DB — creates schema+tables, provides reset/seed)

```ts
import { sql } from 'drizzle-orm';
import { db } from '../src/db/client';

const ddl = sql`
  CREATE SCHEMA IF NOT EXISTS gc;
  CREATE TABLE IF NOT EXISTS gc.tipo_spesa (id serial PRIMARY KEY, descrizione text NOT NULL);
  CREATE TABLE IF NOT EXISTS gc.andamento (
    id serial PRIMARY KEY, giorno date NOT NULL, descrizione text NOT NULL,
    costo numeric NOT NULL, tipo_spesa_id integer NOT NULL REFERENCES gc.tipo_spesa(id));
  CREATE TABLE IF NOT EXISTS gc.utente (id serial PRIMARY KEY, email text NOT NULL, password text NOT NULL);
  CREATE TABLE IF NOT EXISTS gc.token (
    id serial PRIMARY KEY, token text NOT NULL, utente_id integer NOT NULL REFERENCES gc.utente(id));
`;

export const resetDb = async () => {
  await db.execute(sql`TRUNCATE gc.token, gc.andamento, gc.utente, gc.tipo_spesa RESTART IDENTITY CASCADE`);
};

// Deterministic fixtures used by characterization tests.
export const seedFixtures = async () => {
  await db.execute(sql`
    INSERT INTO gc.tipo_spesa (id, descrizione) VALUES
      (1,'spesa'),(2,'carburante'),(3,'bolletta'),(7,'casa');
    INSERT INTO gc.andamento (giorno, descrizione, costo, tipo_spesa_id) VALUES
      ('2025-01-10','spesa gen',100,1),
      ('2025-01-20','carburante gen',50,2),
      ('2025-02-05','spesa feb',80,1),
      ('2025-02-15','bolletta feb',40,3);
    SELECT setval('gc.tipo_spesa_id_seq', 7, true);
  `);
};

// bun preloads this file for every `bun test` run. env.ts already throws if
// DATABASE_URL is unset (eager `required()`), so the DDL runs unconditionally
// here — it is idempotent (CREATE ... IF NOT EXISTS).
await db.execute(ddl);
```

- [ ] **Step 5: Register the test preload in `bunfig.toml`** (now that `setup.ts` exists)

Set the root `bunfig.toml` to:
```toml
[test]
preload = ["./apps/api/test/setup.ts"]
```

- [ ] **Step 6: Verify setup runs**

Run: `DATABASE_URL='<test db url>' JWT_SECRET='x' bun test apps/api/test/health.test.ts`
Expected: PASS (preload creates schema/tables without error).

- [ ] **Step 7: Commit** — supersedes the original commit step below; commit `bunfig.toml` alongside the schema/setup files.

- [ ] **Step 6: Commit**

```bash
git add apps/api/drizzle.config.ts apps/api/src/db/schema.ts apps/api/test/setup.ts apps/api/drizzle
git commit -m "feat(api): Drizzle schema for gc (introspected) + test DB setup"
```

---

### Task 5: Error handling — custom errors + `onError` mapping

**Files:**
- Create: `apps/api/src/errors.ts`
- Modify: `apps/api/src/app.ts`
- Test: `apps/api/test/errors.test.ts`

**Interfaces:**
- Produces: `BadRequestError` (→400), `NotFoundError` (→404), `AuthError` (→401); `withErrorHandling(app)` that registers `.error({...}).onError(...)`. Consumers throw these from services; the handler sets status and returns `{ message }`.

- [ ] **Step 1: Write the failing test** — `apps/api/test/errors.test.ts`

```ts
import { test, expect } from 'bun:test';
import { Elysia } from 'elysia';
import { withErrorHandling, BadRequestError, NotFoundError, AuthError } from '../src/errors';

const app = withErrorHandling(new Elysia())
  .get('/bad', () => { throw new BadRequestError('bad'); })
  .get('/missing', () => { throw new NotFoundError('missing'); })
  .get('/nope', () => { throw new AuthError('nope'); });

test('BadRequestError → 400', async () => {
  const res = await app.handle(new Request('http://localhost/bad'));
  expect(res.status).toBe(400);
  expect(await res.json()).toEqual({ message: 'bad' });
});
test('NotFoundError → 404', async () => {
  expect((await app.handle(new Request('http://localhost/missing'))).status).toBe(404);
});
test('AuthError → 401', async () => {
  expect((await app.handle(new Request('http://localhost/nope'))).status).toBe(401);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `bun test apps/api/test/errors.test.ts`
Expected: FAIL — cannot find module `../src/errors`.

- [ ] **Step 3: Implement `errors.ts`**

```ts
import type { Elysia } from 'elysia';

export class BadRequestError extends Error {}
export class NotFoundError extends Error {}
export class AuthError extends Error {}

export const withErrorHandling = <T extends Elysia>(app: T) =>
  app
    .error({ BadRequestError, NotFoundError, AuthError })
    .onError(({ code, error, status }) => {
      switch (code) {
        case 'BadRequestError':
          return status(400, { message: error.message });
        case 'NotFoundError':
          return status(404, { message: error.message });
        case 'AuthError':
          return status(401, { message: error.message });
      }
    });
```

> Note: `class` here is unavoidable — JS custom error types must extend `Error`; this is the documented exception to the no-`class` rule (dynamic prototype required by the platform).

- [ ] **Step 4: Wire into `app.ts`**

```ts
import { Elysia } from 'elysia';
import cors from '@elysiajs/cors';
import { env } from './env';
import { withErrorHandling } from './errors';

export const buildApp = () =>
  withErrorHandling(new Elysia())
    .use(cors({ origin: env.CORS_ORIGIN, credentials: true }))
    .get('/health', () => ({ status: 'ok' }));
```

- [ ] **Step 5: Run to verify it passes**

Run: `bun test apps/api/test/errors.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/errors.ts apps/api/src/app.ts apps/api/test/errors.test.ts
git commit -m "feat(api): centralized error handling (400/404/401)"
```

---

### Task 6: `tipo-spesa` resource (read-only)

**Files:**
- Create: `apps/api/src/tipo-spesa/{tipo-spesa.repository,tipo-spesa.service,tipo-spesa.routes}.ts`
- Modify: `apps/api/src/app.ts`
- Test: `apps/api/test/tipo-spesa.test.ts`

**Interfaces:**
- Consumes: `db`, `tipoSpesa` table, `NotFoundError`.
- Produces: `createTipoSpesaRepository(db)` → `{ findAll(), findById(id) }`; `createTipoSpesaService(repo)` → `{ findAll(), findById(id) }`; `tipoSpesaRoutes` (Elysia plugin, prefix `/tipo-spesa`). `findById` throws `NotFoundError` when absent.

- [ ] **Step 1: Write the failing test** — `apps/api/test/tipo-spesa.test.ts`

```ts
import { test, expect, beforeEach } from 'bun:test';
import { buildApp } from '../src/app';
import { resetDb, seedFixtures } from './setup';

beforeEach(async () => { await resetDb(); await seedFixtures(); });

test('GET /tipo-spesa returns all categories', async () => {
  const res = await buildApp().handle(new Request('http://localhost/tipo-spesa'));
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body).toHaveLength(4);
  expect(body.map((t: { descrizione: string }) => t.descrizione)).toContain('spesa');
});

test('GET /tipo-spesa/:id → 404 when missing', async () => {
  const res = await buildApp().handle(new Request('http://localhost/tipo-spesa/999'));
  expect(res.status).toBe(404);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `bun test apps/api/test/tipo-spesa.test.ts`
Expected: FAIL — route not found (404 on `/tipo-spesa`, or module missing).

- [ ] **Step 3: Implement repository**

```ts
import { eq } from 'drizzle-orm';
import type { db as Db } from '../db/client';
import { tipoSpesa } from '../db/schema';

export const createTipoSpesaRepository = (db: typeof Db) => ({
  findAll: () => db.select().from(tipoSpesa),
  findById: async (id: number) => {
    const rows = await db.select().from(tipoSpesa).where(eq(tipoSpesa.id, id));
    return rows[0] ?? null;
  },
});
```

- [ ] **Step 4: Implement service**

```ts
import { NotFoundError } from '../errors';
import type { createTipoSpesaRepository } from './tipo-spesa.repository';

export const createTipoSpesaService = (repo: ReturnType<typeof createTipoSpesaRepository>) => ({
  findAll: () => repo.findAll(),
  findById: async (id: number) => {
    const found = await repo.findById(id);
    if (!found) throw new NotFoundError(`TipoSpesa ${id} not found`);
    return found;
  },
});
```

- [ ] **Step 5: Implement routes**

```ts
import { Elysia, t } from 'elysia';
import { db } from '../db/client';
import { createTipoSpesaRepository } from './tipo-spesa.repository';
import { createTipoSpesaService } from './tipo-spesa.service';

const service = createTipoSpesaService(createTipoSpesaRepository(db));

export const tipoSpesaRoutes = new Elysia({ prefix: '/tipo-spesa' })
  .get('/', () => service.findAll())
  .get('/:id', ({ params }) => service.findById(params.id), {
    params: t.Object({ id: t.Number() }),
  });
```

- [ ] **Step 6: Mount in `app.ts`** (add `.use(tipoSpesaRoutes)` after `/health`)

```ts
import { tipoSpesaRoutes } from './tipo-spesa/tipo-spesa.routes';
// ...inside buildApp():  .get('/health', ...).use(tipoSpesaRoutes)
```

- [ ] **Step 7: Run to verify it passes**

Run: `bun test apps/api/test/tipo-spesa.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/tipo-spesa apps/api/src/app.ts apps/api/test/tipo-spesa.test.ts
git commit -m "feat(api): tipo-spesa read-only resource"
```

---

### Task 7: `andamento` resource (CRUD)

**Files:**
- Create: `apps/api/src/andamento/{andamento.repository,andamento.service,andamento.routes}.ts`
- Modify: `apps/api/src/app.ts`
- Test: `apps/api/test/andamento.test.ts`

**Interfaces:**
- Consumes: `db`, `andamento`+`tipoSpesa` tables, `BadRequestError`, `NotFoundError`, `AndamentoInputSchema`.
- Produces: `createAndamentoRepository(db)` → `{ findAll(), findById(id), save(input), update(input), remove(id) }` returning rows shaped as `Andamento` (joined `tipoSpesa`, `costo` coerced to number); `createAndamentoService(repo)` with the same methods enforcing validation; `andamentoRoutes` (prefix `/andamento`). Routes: `GET /`, `GET /:id`, `POST /`, `PUT /:id`, `DELETE /:id`. `findAll` sorted by `giorno` DESC.

- [ ] **Step 1: Write the failing test** — `apps/api/test/andamento.test.ts`

```ts
import { test, expect, beforeEach } from 'bun:test';
import { buildApp } from '../src/app';
import { resetDb, seedFixtures } from './setup';

beforeEach(async () => { await resetDb(); await seedFixtures(); });

const req = (path: string, init?: RequestInit) =>
  buildApp().handle(new Request(`http://localhost${path}`, init));

test('GET /andamento returns entries sorted by giorno DESC, costo is a number', async () => {
  const res = await req('/andamento');
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body).toHaveLength(4);
  expect(body[0].giorno >= body[1].giorno).toBe(true);
  expect(typeof body[0].costo).toBe('number');
  expect(body[0].tipoSpesa.descrizione).toBeDefined();
});

test('POST /andamento creates an entry', async () => {
  const res = await req('/andamento', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ giorno: '2025-03-01', descrizione: 'nuovo', costo: 12.5, tipoSpesa: { id: 1 } }),
  });
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.id).toBeGreaterThan(0);
  expect(body.costo).toBe(12.5);
});

test('POST /andamento with missing tipoSpesa → 400', async () => {
  const res = await req('/andamento', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ giorno: '2025-03-01', descrizione: 'x', costo: 5, tipoSpesa: { id: 999 } }),
  });
  expect(res.status).toBe(400);
});

test('PUT /andamento/:id updates; unknown id → 400', async () => {
  const list = await (await req('/andamento')).json();
  const id = list[0].id;
  const ok = await req(`/andamento/${id}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id, giorno: '2025-01-10', descrizione: 'mod', costo: 5, tipoSpesa: { id: 1 } }),
  });
  expect(ok.status).toBe(200);
  const bad = await req('/andamento/999999', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id: 999999, giorno: '2025-01-10', descrizione: 'x', costo: 5, tipoSpesa: { id: 1 } }),
  });
  expect(bad.status).toBe(400);
});

test('DELETE /andamento/:id removes; unknown id → 404', async () => {
  const list = await (await req('/andamento')).json();
  expect((await req(`/andamento/${list[0].id}`, { method: 'DELETE' })).status).toBe(200);
  expect((await req('/andamento/999999', { method: 'DELETE' })).status).toBe(404);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `bun test apps/api/test/andamento.test.ts`
Expected: FAIL — module/route missing.

- [ ] **Step 3: Implement repository**

```ts
import { desc, eq } from 'drizzle-orm';
import type { db as Db } from '../db/client';
import { andamento, tipoSpesa } from '../db/schema';
import type { Andamento, AndamentoInput } from '@gc/shared-types';

const toAndamento = (row: {
  id: number; giorno: string; descrizione: string; costo: string;
  tipoSpesaId: number; tsDescrizione: string;
}): Andamento => ({
  id: row.id,
  giorno: row.giorno,
  descrizione: row.descrizione,
  costo: Number(row.costo),
  tipoSpesa: { id: row.tipoSpesaId, descrizione: row.tsDescrizione },
});

const baseSelect = (db: typeof Db) =>
  db
    .select({
      id: andamento.id, giorno: andamento.giorno, descrizione: andamento.descrizione,
      costo: andamento.costo, tipoSpesaId: andamento.tipoSpesaId, tsDescrizione: tipoSpesa.descrizione,
    })
    .from(andamento)
    .innerJoin(tipoSpesa, eq(andamento.tipoSpesaId, tipoSpesa.id));

export const createAndamentoRepository = (db: typeof Db) => ({
  findAll: async (): Promise<Andamento[]> =>
    (await baseSelect(db).orderBy(desc(andamento.giorno))).map(toAndamento),
  findById: async (id: number): Promise<Andamento | null> => {
    const rows = await baseSelect(db).where(eq(andamento.id, id));
    return rows[0] ? toAndamento(rows[0]) : null;
  },
  tipoSpesaExists: async (id: number): Promise<boolean> =>
    (await db.select({ id: tipoSpesa.id }).from(tipoSpesa).where(eq(tipoSpesa.id, id))).length > 0,
  insert: async (input: AndamentoInput): Promise<number> => {
    const rows = await db
      .insert(andamento)
      .values({
        giorno: input.giorno, descrizione: input.descrizione,
        costo: String(input.costo), tipoSpesaId: input.tipoSpesa.id,
      })
      .returning({ id: andamento.id });
    return rows[0]!.id;
  },
  update: async (input: AndamentoInput): Promise<void> => {
    await db
      .update(andamento)
      .set({
        giorno: input.giorno, descrizione: input.descrizione,
        costo: String(input.costo), tipoSpesaId: input.tipoSpesa.id,
      })
      .where(eq(andamento.id, input.id!));
  },
  remove: async (id: number): Promise<number> => {
    const rows = await db.delete(andamento).where(eq(andamento.id, id)).returning({ id: andamento.id });
    return rows.length;
  },
});
```

- [ ] **Step 4: Implement service**

```ts
import { BadRequestError, NotFoundError } from '../errors';
import type { AndamentoInput } from '@gc/shared-types';
import type { createAndamentoRepository } from './andamento.repository';

export const createAndamentoService = (repo: ReturnType<typeof createAndamentoRepository>) => ({
  findAll: () => repo.findAll(),
  findById: async (id: number) => {
    const found = await repo.findById(id);
    if (!found) throw new NotFoundError(`Andamento ${id} not found`);
    return found;
  },
  save: async (input: AndamentoInput) => {
    if (!(await repo.tipoSpesaExists(input.tipoSpesa.id)))
      throw new BadRequestError(`TipoSpesa ${input.tipoSpesa.id} not found`);
    const id = await repo.insert(input);
    return repo.findById(id);
  },
  update: async (input: AndamentoInput) => {
    if (input.id == null || !(await repo.findById(input.id)))
      throw new BadRequestError(`Andamento ${input.id} not found`);
    await repo.update(input);
    return repo.findById(input.id);
  },
  remove: async (id: number) => {
    if ((await repo.remove(id)) === 0) throw new NotFoundError(`Andamento ${id} not found`);
    return { deleted: id };
  },
});
```

- [ ] **Step 5: Implement routes**

```ts
import { Elysia, t } from 'elysia';
import { AndamentoInputSchema } from '@gc/shared-types';
import { db } from '../db/client';
import { createAndamentoRepository } from './andamento.repository';
import { createAndamentoService } from './andamento.service';

const service = createAndamentoService(createAndamentoRepository(db));

export const andamentoRoutes = new Elysia({ prefix: '/andamento' })
  .get('/', () => service.findAll())
  .get('/:id', ({ params }) => service.findById(params.id), { params: t.Object({ id: t.Number() }) })
  .post('/', ({ body }) => service.save(body), { body: AndamentoInputSchema })
  .put('/:id', ({ body }) => service.update(body), {
    params: t.Object({ id: t.Number() }),
    body: AndamentoInputSchema,
  })
  .delete('/:id', ({ params }) => service.remove(params.id), { params: t.Object({ id: t.Number() }) });
```

- [ ] **Step 6: Mount in `app.ts`** (add `.use(andamentoRoutes)`).

- [ ] **Step 7: Run to verify it passes**

Run: `bun test apps/api/test/andamento.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/andamento apps/api/src/app.ts apps/api/test/andamento.test.ts
git commit -m "feat(api): andamento CRUD resource"
```

---

### Task 8: `utente` resource + Bearer auth (Phase-1 contract)

**Files:**
- Create: `apps/api/src/auth/auth.plugin.ts`
- Create: `apps/api/src/utente/{utente.repository,utente.service,utente.routes}.ts`
- Modify: `apps/api/src/app.ts`
- Test: `apps/api/test/utente.test.ts`

**Interfaces:**
- Consumes: `db`, `utente`+`token` tables, `@elysiajs/jwt`, `env.JWT_SECRET`, errors, `LoginInputSchema`.
- Produces: `authPlugin` (Elysia plugin: verifies `Authorization: Bearer`, derives `utente` into context, throws `AuthError` when invalid); `createUtenteRepository(db)`; `createUtenteService(repo, jwt)` → `{ login, register, logout, logoutAll, me, update, remove }`; `utenteRoutes` (prefix `/utente`). `login` returns `{ utente: { id, email }, token }`; register returns 201.

- [ ] **Step 1: Write the failing test** — `apps/api/test/utente.test.ts`

```ts
import { test, expect, beforeEach } from 'bun:test';
import { buildApp } from '../src/app';
import { resetDb } from './setup';

beforeEach(async () => { await resetDb(); });

const json = (path: string, method: string, body?: unknown, token?: string) =>
  buildApp().handle(new Request(`http://localhost${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  }));

test('register then login returns { utente, token }', async () => {
  const reg = await json('/utente', 'POST', { email: 'a@b.it', password: 'pw' });
  expect(reg.status).toBe(201);
  const res = await json('/utente/login', 'POST', { email: 'a@b.it', password: 'pw' });
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.token).toBeString();
  expect(body.utente.email).toBe('a@b.it');
});

test('login with wrong password → 401', async () => {
  await json('/utente', 'POST', { email: 'a@b.it', password: 'pw' });
  expect((await json('/utente/login', 'POST', { email: 'a@b.it', password: 'nope' })).status).toBe(401);
});

test('GET /utente/me requires a valid Bearer token', async () => {
  await json('/utente', 'POST', { email: 'a@b.it', password: 'pw' });
  const token = (await (await json('/utente/login', 'POST', { email: 'a@b.it', password: 'pw' })).json()).token;
  expect((await json('/utente/me', 'GET')).status).toBe(401);
  const me = await json('/utente/me', 'GET', undefined, token);
  expect(me.status).toBe(200);
  expect((await me.json()).email).toBe('a@b.it');
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `bun test apps/api/test/utente.test.ts`
Expected: FAIL — routes/modules missing.

- [ ] **Step 3: Implement repository**

```ts
import { eq } from 'drizzle-orm';
import type { db as Db } from '../db/client';
import { utente, token } from '../db/schema';

export const createUtenteRepository = (db: typeof Db) => ({
  findByEmail: async (email: string) =>
    (await db.select().from(utente).where(eq(utente.email, email)))[0] ?? null,
  findById: async (id: number) =>
    (await db.select().from(utente).where(eq(utente.id, id)))[0] ?? null,
  create: async (email: string, passwordHash: string) =>
    (await db.insert(utente).values({ email, password: passwordHash }).returning())[0]!,
  updatePassword: async (id: number, passwordHash: string) => {
    await db.update(utente).set({ password: passwordHash }).where(eq(utente.id, id));
  },
  remove: async (id: number) => { await db.delete(utente).where(eq(utente.id, id)); },
  addToken: async (utenteId: number, value: string) => {
    await db.insert(token).values({ utenteId, token: value });
  },
  removeToken: async (utenteId: number, value: string) => {
    await db.delete(token).where(eq(token.token, value));
  },
  removeAllTokens: async (utenteId: number) => {
    await db.delete(token).where(eq(token.utenteId, utenteId));
  },
});
```

- [ ] **Step 4: Implement service** (bcrypt via `Bun.password`; JWT via injected signer)

```ts
import { AuthError, BadRequestError } from '../errors';
import type { createUtenteRepository } from './utente.repository';

type Jwt = { sign: (p: Record<string, unknown>) => Promise<string> };

export const createUtenteService = (
  repo: ReturnType<typeof createUtenteRepository>,
  jwt: Jwt,
) => ({
  register: async (email: string, password: string) => {
    const hash = await Bun.password.hash(password); // bcrypt-compatible default
    const created = await repo.create(email, hash);
    return { id: created.id, email: created.email };
  },
  login: async (email: string, password: string) => {
    const found = await repo.findByEmail(email);
    if (!found || !(await Bun.password.verify(password, found.password)))
      throw new AuthError('Email o password errate');
    const token = await jwt.sign({ id: String(found.id) });
    await repo.addToken(found.id, token);
    return { utente: { id: found.id, email: found.email }, token };
  },
  me: async (id: number) => {
    const found = await repo.findById(id);
    if (!found) throw new AuthError('Utente non trovato');
    return { id: found.id, email: found.email };
  },
  update: async (id: number, password: string) => {
    if (!password) throw new BadRequestError('Password richiesta');
    await repo.updatePassword(id, await Bun.password.hash(password));
    return repo.findById(id).then((u) => ({ id: u!.id, email: u!.email }));
  },
  logout: (id: number, token: string) => repo.removeToken(id, token),
  logoutAll: (id: number) => repo.removeAllTokens(id),
  remove: (id: number) => repo.remove(id),
});
```

- [ ] **Step 5: Implement `auth.plugin.ts`** (Bearer verify + hydrate `utente`)

```ts
import { Elysia } from 'elysia';
import jwtPlugin from '@elysiajs/jwt';
import { env } from '../env';
import { AuthError } from '../errors';
import { db } from '../db/client';
import { createUtenteRepository } from '../utente/utente.repository';

const repo = createUtenteRepository(db);

// 14d expiry matches the current server. HS256 is the plugin default.
export const jwtConfig = jwtPlugin({ name: 'jwt', secret: env.JWT_SECRET, exp: '14d' });

export const authPlugin = new Elysia({ name: 'auth' })
  .use(jwtConfig)
  .derive({ as: 'scoped' }, async ({ jwt, headers }) => {
    const raw = headers.authorization?.replace('Bearer ', '');
    if (!raw) throw new AuthError('Token mancante');
    const payload = await jwt.verify(raw);
    if (!payload || typeof payload.id !== 'string') throw new AuthError('Token non valido');
    const found = await repo.findById(Number(payload.id));
    if (!found) throw new AuthError('Utente non trovato');
    return { utente: { id: found.id, email: found.email }, token: raw };
  });
```

- [ ] **Step 6: Implement `utente.routes.ts`** (public login/register on a free group; the rest guarded by `authPlugin`)

```ts
import { Elysia, t } from 'elysia';
import { LoginInputSchema } from '@gc/shared-types';
import { db } from '../db/client';
import { jwtConfig, authPlugin } from '../auth/auth.plugin';
import { createUtenteRepository } from './utente.repository';
import { createUtenteService } from './utente.service';

const repo = createUtenteRepository(db);

export const utenteRoutes = new Elysia({ prefix: '/utente' })
  .use(jwtConfig)
  .resolve({ as: 'scoped' }, ({ jwt }) => ({ service: createUtenteService(repo, jwt) }))
  // --- public ---
  .post('/login', ({ body, service }) => service.login(body.email, body.password), {
    body: LoginInputSchema,
  })
  .post('/', ({ body, service, set }) => {
    set.status = 201;
    return service.register(body.email, body.password);
  }, { body: LoginInputSchema })
  // --- guarded ---
  .use(authPlugin)
  .get('/me', ({ utente }) => utente)
  .patch('/me', ({ utente, body, service }) => service.update(utente.id, body.password), {
    body: t.Object({ email: t.Optional(t.String()), password: t.String() }),
  })
  .delete('/me', ({ utente, service }) => service.remove(utente.id))
  .post('/logout', ({ utente, token, service }) => service.logout(utente.id, token))
  .post('/logout-all', ({ utente, service }) => service.logoutAll(utente.id));
```

- [ ] **Step 7: Mount in `app.ts`** (add `.use(utenteRoutes)`).

- [ ] **Step 8: Run to verify it passes**

Run: `bun test apps/api/test/utente.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/utente apps/api/src/auth apps/api/src/app.ts apps/api/test/utente.test.ts
git commit -m "feat(api): utente resource + Bearer JWT auth (phase-1 contract)"
```

---

### Task 9: `statistiche` resource — verbatim SQL + characterization tests

**Files:**
- Create: `apps/api/src/statistiche/{statistiche.repository,statistiche.service,statistiche.routes}.ts`
- Modify: `apps/api/src/app.ts`
- Test: `apps/api/test/statistiche.test.ts`

**Interfaces:**
- Consumes: `db`, `sql` from `drizzle-orm`, `Interval`, `authPlugin`.
- Produces: `createStatisticheRepository(db)` → `{ speseFrequenti(interval), statistics(interval, tipoSpesa?) }` returning `Statistica[]`; `createStatisticheService(repo)` → `{ speseFrequenti, spesa, carburante, bolletta, casa, tutto }`; `statisticheRoutes` (prefix `/statistiche`, guarded). Six GET routes taking `:interval`.

> **CRITICAL:** the SQL below is transcribed from `gc-server/src/repositories/andamento.repository.ts`. Keep the category-ID sets, `date_trunc`/`generate_series`/`right join`/`coalesce`, `YYYYMM`/`YYYY` formats, and `limit 48` **exactly**. Interpolate only the `whereCondition`/interval branch and the category filter, never user input directly (interval is validated against `M|Y|A`).

- [ ] **Step 1: Write the failing characterization test** — `apps/api/test/statistiche.test.ts`

```ts
import { test, expect, beforeEach } from 'bun:test';
import { createStatisticheRepository } from '../src/statistiche/statistiche.repository';
import { db } from '../src/db/client';
import { Interval } from '@gc/shared-types';
import { resetDb, seedFixtures } from './setup';

const repo = createStatisticheRepository(db);
beforeEach(async () => { await resetDb(); await seedFixtures(); });

// Fixtures: spesa 100 (2025-01) + 80 (2025-02); carburante 50 (2025-01); bolletta 40 (2025-02).
test('speseFrequenti (A) sums by category, ordered by value DESC', async () => {
  const rows = await repo.speseFrequenti(Interval.tutto);
  expect(rows.map((r) => [r.name, Number(r.value)])).toEqual([
    ['spesa', 180],
    ['carburante', 50],
    ['bolletta', 40],
  ]);
});

test('statistics monthly for spesa (id 1) fills gaps with 0 and formats YYYYMM DESC', async () => {
  const rows = await repo.statistics(Interval.mese, 1);
  const map = Object.fromEntries(rows.map((r) => [r.name, Number(r.value)]));
  expect(map['202501']).toBe(100);
  expect(map['202502']).toBe(80);
  // spesa has no entry before Jan; series starts at year start -> earlier months are 0 if present
  expect(rows[0].name >= rows[rows.length - 1].name).toBe(true);
});

test('statistics yearly for all default categories aggregates to 2025', async () => {
  const rows = await repo.statistics(Interval.anno);
  const y2025 = rows.find((r) => r.name === '2025');
  expect(y2025).toBeDefined();
  expect(Number(y2025!.value)).toBe(270); // 100+80+50+40, all fixture categories are in the yearly default set
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `bun test apps/api/test/statistiche.test.ts`
Expected: FAIL — module `../src/statistiche/statistiche.repository` missing.

- [ ] **Step 3: Implement repository (verbatim SQL)**

```ts
import { sql } from 'drizzle-orm';
import type { db as Db } from '../db/client';
import { Interval, type Statistica } from '@gc/shared-types';

export const createStatisticheRepository = (db: typeof Db) => {
  const speseFrequenti = async (interval: Interval): Promise<Statistica[]> => {
    let whereCondition = sql``;
    if (interval === Interval.mese) whereCondition = sql`WHERE giorno > NOW() - interval '1 MONTH'`;
    else if (interval === Interval.anno) whereCondition = sql`WHERE giorno > NOW() - interval '1 YEAR'`;
    const result = await db.execute<Statistica>(sql`
      SELECT ts.descrizione AS name, SUM(a.costo) AS value
      FROM gc.andamento a JOIN gc.tipo_spesa ts ON a.tipo_spesa_id = ts.id
      ${whereCondition}
      GROUP BY ts.id, ts.descrizione
      ORDER BY value DESC
    `);
    return [...result];
  };

  const statistics = async (interval: Interval, tipoSpesa?: number): Promise<Statistica[]> => {
    if (interval === Interval.mese) {
      const filter = tipoSpesa != null ? sql`= ${tipoSpesa}` : sql`in (1,2,3,5,7,9,13,16)`;
      const result = await db.execute<Statistica>(sql`
        with filtered_andamento as (
          select * from gc.andamento where gc.andamento.tipo_spesa_id ${filter}
        ),
        months as (
          select generate_series(min_month, max_month, '1 month') as month
          from (
            select date_trunc('year', min(giorno)) as min_month,
                   date_trunc('month', max(giorno)) as max_month
            from gc.andamento
          ) s
        )
        select to_char(date_trunc('month', m.month), 'YYYYMM') as name,
               coalesce(sum(costo), 0) as value
        from filtered_andamento
        right join months m on date_trunc('month', filtered_andamento.giorno) = m.month
        group by m.month
        order by m.month desc
        limit 48
      `);
      return [...result];
    }
    if (interval === Interval.anno) {
      const filter = tipoSpesa != null ? sql`= ${tipoSpesa}` : sql`in (1,3,7,9,10,13,16)`;
      const result = await db.execute<Statistica>(sql`
        with filtered_andamento as (
          select * from gc.andamento where gc.andamento.tipo_spesa_id ${filter}
        ),
        years as (
          select generate_series(min_year, max_year, '1 year') as anno
          from (
            select date_trunc('year', min(giorno)) as min_year,
                   date_trunc('year', max(giorno)) as max_year
            from gc.andamento
          ) s
        )
        select to_char(date_trunc('year', y.anno), 'YYYY') as name,
               coalesce(sum(costo), 0) as value
        from filtered_andamento
        right join years y on date_trunc('year', filtered_andamento.giorno) = y.anno
        group by y.anno
        order by y.anno desc
      `);
      return [...result];
    }
    return []; // Interval.tutto: original falls through to empty (preserved behavior)
  };

  return { speseFrequenti, statistics };
};
```

> Note on parity: the original interpolated the category filter as a raw string (`${tipoSpesa || " in (...)"}`). Here the same two constant ID lists are embedded as SQL literals; `tipoSpesa` (a validated number) is bound as a parameter. Behavior is identical; injection surface is removed.

- [ ] **Step 4: Implement service**

```ts
import { Interval } from '@gc/shared-types';
import type { createStatisticheRepository } from './statistiche.repository';

export const createStatisticheService = (repo: ReturnType<typeof createStatisticheRepository>) => ({
  speseFrequenti: (i: Interval) => repo.speseFrequenti(i),
  spesa: (i: Interval) => repo.statistics(i, 1),
  carburante: (i: Interval) => repo.statistics(i, 2),
  bolletta: (i: Interval) => repo.statistics(i, 3),
  casa: (i: Interval) => repo.statistics(i, 7),
  tutto: (i: Interval) => repo.statistics(i),
});
```

- [ ] **Step 5: Implement routes** (guarded; `:interval` validated to M/Y/A)

```ts
import { Elysia } from 'elysia';
import { IntervalSchema, type Interval } from '@gc/shared-types';
import { db } from '../db/client';
import { authPlugin } from '../auth/auth.plugin';
import { createStatisticheRepository } from './statistiche.repository';
import { createStatisticheService } from './statistiche.service';

const service = createStatisticheService(createStatisticheRepository(db));
const params = { params: { interval: IntervalSchema } } as const;
const asInterval = (v: string) => v as Interval;

export const statisticheRoutes = new Elysia({ prefix: '/statistiche' })
  .use(authPlugin)
  .get('/spese-frequenti/:interval', ({ params: p }) => service.speseFrequenti(asInterval(p.interval)), params)
  .get('/spesa/:interval', ({ params: p }) => service.spesa(asInterval(p.interval)), params)
  .get('/carburante/:interval', ({ params: p }) => service.carburante(asInterval(p.interval)), params)
  .get('/bolletta/:interval', ({ params: p }) => service.bolletta(asInterval(p.interval)), params)
  .get('/casa/:interval', ({ params: p }) => service.casa(asInterval(p.interval)), params)
  .get('/tutto/:interval', ({ params: p }) => service.tutto(asInterval(p.interval)), params);
```

- [ ] **Step 6: Mount in `app.ts`** (add `.use(statisticheRoutes)`).

- [ ] **Step 7: Run to verify it passes**

Run: `bun test apps/api/test/statistiche.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 8: Full suite green**

Run: `DATABASE_URL='<test db>' JWT_SECRET='x' bun test`
Expected: all tests PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/statistiche apps/api/src/app.ts apps/api/test/statistiche.test.ts
git commit -m "feat(api): statistiche resource with verbatim SQL + characterization tests"
```

---

### Task 10: CI (GitHub Actions on `master`)

**Files:**
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Produces: CI that installs, typechecks, lints, and runs `bun test` against an ephemeral Postgres, on PRs and pushes to `master`.

- [ ] **Step 1: Write `.github/workflows/ci.yml`**

```yaml
name: CI
on:
  push:
    branches: [master]
  pull_request:
    branches: [master]
jobs:
  build-test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_USER: gc
          POSTGRES_PASSWORD: gc
          POSTGRES_DB: gc
        ports: ['5432:5432']
        options: >-
          --health-cmd pg_isready --health-interval 10s
          --health-timeout 5s --health-retries 5
    env:
      DATABASE_URL: postgres://gc:gc@localhost:5432/gc
      JWT_SECRET: ci-secret
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install --frozen-lockfile
      - run: bun run lint
      - run: bun run typecheck
      - run: bun test
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: typecheck + lint + bun test on master"
```

---

## Self-Review

**1. Spec coverage (Phase 0 + Phase 1 scope):**
- Monorepo scaffold (spec §3) → Task 1. ✅
- shared-types TypeBox (spec §5) → Task 2 (schemas; Eden is Phase 3). ✅
- Bun.sql + Drizzle client, schema `gc`, TLS-safe (spec §4, §11) → Tasks 3–4. ✅
- 20 routes preserved: tipo-spesa ×2 (Task 6), andamento ×5 (Task 7), utente ×7 (Task 8), statistiche ×6 (Task 9), plus `/health`. ✅ (login/register public; rest Bearer-guarded per spec Phase-1 constraint.)
- Error mapping 400/404/401 (spec §4) → Task 5. ✅
- Statistics verbatim SQL + hardcoded ID sets (spec §2.1, §12) → Task 9 with characterization tests. ✅
- `Bun.password` bcrypt-compatible (spec §4) → Task 8. ✅
- CI on `master` (spec §9) → Task 10. ✅
- **Out of Phase-1 scope (correctly deferred):** auth hardening/cookies/refresh (Phase 2), Eden Treaty (Phase 3), React frontend (Phase 4), Playwright E2E (Phase 5), Railway deploy + custom domain (Phase 6). These get their own plans.

**2. Placeholder scan:** No TBD/TODO; every code step has full code; every test step has real assertions. The only literal placeholder is `<dev db url>` / `<test db>` in run commands — these are environment values the operator supplies, not code gaps.

**3. Type consistency:** `createXRepository`/`createXService` naming uniform; `Andamento`/`AndamentoInput`/`Statistica`/`Interval` come from `@gc/shared-types` and are used consistently; `buildApp()` used by every test; `authPlugin`/`jwtConfig` names consistent between Tasks 8–9. `costo` is `numeric` (string in DB) → coerced to `number` in the andamento mapper and asserted as a number in tests.

**Known follow-ups to confirm during execution (not plan gaps):**
- Exact Drizzle column modes from real introspection (Task 4 Step 2) may refine `date`/`numeric` options — reconcile the hand-written schema with `db:pull` output.
- Elysia `derive`/`resolve` scoping (`as: 'scoped'`) API should be checked against the installed Elysia version; the pattern (verify header → derive `utente`) is the target regardless of exact combinator.
