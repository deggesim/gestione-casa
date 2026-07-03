# Phase 2 — Auth Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Phase-1's Bearer-header JWT with an httpOnly-cookie access + refresh token model that truly revokes on logout, and close the Phase-1 gap where `andamento`/`tipo-spesa` routes shipped unguarded.

**Architecture:** Login mints a short-lived **access** JWT (15 min) and a long-lived **refresh** JWT (14 d), both delivered as httpOnly `Secure` `SameSite=Lax` cookies. Access tokens are stateless (signature + expiry only). Refresh tokens are stored in table `gc.token` scoped to the user; `POST /utente/refresh` rotates them (delete old row, issue new pair), and `logout`/`logout-all` delete the row(s) — so revocation is real. All protected routes verify the access cookie via a single `authPlugin`.

**Tech Stack:** Bun 1.3.14 · Elysia 1.4.29 (native cookie jar) · `@elysiajs/jwt` 1.4.2 (per-sign `exp`) · Drizzle ORM (bun-sql) · TypeBox (shared-types) · `bun test`.

## Global Constraints

- **Behavior parity except auth.** All 20 routes, paths, and status codes preserved (spec §2.1). Only the auth mechanism changes. Do **not** touch `statistiche.repository.ts` / `statistiche.service.ts` — the verbatim SQL and hardcoded ID sets `(1,2,3,5,7,9,13,16)` monthly / `(1,3,7,9,10,13,16)` yearly stay untouched.
- **Functional style, no `class`** — except `Error` subclasses in `errors.ts` (platform necessity; GOVERNS, do not "fix"). Services/repos are factory functions returning objects of arrow methods. Named exports, relative imports within `apps/api`, `@gc/shared-types` for shared schemas.
- **TypeScript strict**; `type` over `interface`. `tsc --noEmit` (per-workspace `typecheck`) and `prettier --check .` (root `lint`) must stay green — CI gates on both plus `bun test`.
- **Password hashing stays `Bun.password` bcrypt cost 8** (verifies legacy hashes; do not change algorithm).
- **Test environment** (pass to every implementer that runs tests):
  - Bun 1.3.14, Postgres on `localhost:5432`.
  - TEST DB (isolated, safe to TRUNCATE): `DATABASE_URL=postgres://gctest:gctest@localhost:5432/gc_test`
  - `JWT_SECRET=test-secret` (any value).
  - **DO NOT** point tests at the real `postgres` DB — it holds real rows.
  - Run the full suite from repo root: `DATABASE_URL=postgres://gctest:gctest@localhost:5432/gc_test JWT_SECRET=test-secret bun test`
  - Preload `apps/api/test/setup.ts` (configured in `bunfig.toml`) creates the schema idempotently and exports `resetDb`/`seedFixtures`.
- **Custom domain is a deploy-time prereq only** (spec §6). In dev/test, cookies work over `localhost` (same origin). `COOKIE_SECURE=false` in dev, `true` in prod; `COOKIE_DOMAIN` optional (set to the shared registrable domain in prod so `app.<domain>`/`api.<domain>` share the cookie).

---

### Task 1: Auth cookie/config module

Centralize cookie names, TTLs, and the httpOnly/Secure/SameSite option builder so routes never hand-roll cookie attributes. Also extend `env.ts` with the cookie knobs.

**Files:**
- Modify: `apps/api/src/env.ts`
- Create: `apps/api/src/auth/cookies.ts`
- Test: `apps/api/test/cookies.test.ts`

**Interfaces:**
- Consumes: `env` from `../env`.
- Produces:
  - `env.COOKIE_SECURE: boolean`, `env.COOKIE_DOMAIN: string | undefined` (added to existing `env`).
  - `ACCESS_COOKIE = 'access'`, `REFRESH_COOKIE = 'refresh'` (string consts).
  - `ACCESS_TTL = '15m'`, `REFRESH_TTL = '14d'` (JWT sign expiry strings).
  - `ACCESS_MAX_AGE = 900`, `REFRESH_MAX_AGE = 1209600` (cookie Max-Age seconds).
  - `authCookieOptions(maxAge: number): { httpOnly: true; secure: boolean; sameSite: 'lax'; path: '/'; domain: string | undefined; maxAge: number }`

- [ ] **Step 1: Write the failing test**

Create `apps/api/test/cookies.test.ts`:

```typescript
import { test, expect } from 'bun:test';
import {
  authCookieOptions,
  ACCESS_MAX_AGE,
  REFRESH_MAX_AGE,
  ACCESS_COOKIE,
  REFRESH_COOKIE,
} from '../src/auth/cookies';

test('authCookieOptions sets httpOnly + Lax + root path', () => {
  const opts = authCookieOptions(ACCESS_MAX_AGE);
  expect(opts.httpOnly).toBe(true);
  expect(opts.sameSite).toBe('lax');
  expect(opts.path).toBe('/');
  expect(opts.maxAge).toBe(900);
  // secure follows env.COOKIE_SECURE; false under the test env (unset)
  expect(opts.secure).toBe(false);
});

test('cookie constants are stable', () => {
  expect([ACCESS_COOKIE, REFRESH_COOKIE]).toEqual(['access', 'refresh']);
  expect(REFRESH_MAX_AGE).toBe(14 * 24 * 60 * 60);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `DATABASE_URL=postgres://gctest:gctest@localhost:5432/gc_test JWT_SECRET=test-secret bun test apps/api/test/cookies.test.ts`
Expected: FAIL — cannot resolve `../src/auth/cookies`.

- [ ] **Step 3: Extend `env.ts`**

Replace the `export const env = {...}` block in `apps/api/src/env.ts` with:

```typescript
export const env = {
  DATABASE_URL: required('DATABASE_URL'),
  JWT_SECRET: required('JWT_SECRET'),
  PORT: Number(process.env.PORT ?? 5000),
  CORS_ORIGIN: process.env.CORS_ORIGIN ?? '*',
  // Cookies: Secure only over HTTPS (prod). Domain lets api.<d>/app.<d> share the cookie.
  COOKIE_SECURE: process.env.COOKIE_SECURE === 'true',
  COOKIE_DOMAIN: process.env.COOKIE_DOMAIN || undefined,
};
```

- [ ] **Step 4: Create `apps/api/src/auth/cookies.ts`**

```typescript
import { env } from '../env';

export const ACCESS_COOKIE = 'access';
export const REFRESH_COOKIE = 'refresh';

// JWT sign expiry (parsed by @elysiajs/jwt).
export const ACCESS_TTL = '15m';
export const REFRESH_TTL = '14d';

// Cookie Max-Age in seconds (kept in sync with the TTLs above).
export const ACCESS_MAX_AGE = 15 * 60;
export const REFRESH_MAX_AGE = 14 * 24 * 60 * 60;

export const authCookieOptions = (maxAge: number) =>
  ({
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: 'lax',
    path: '/',
    domain: env.COOKIE_DOMAIN,
    maxAge,
  }) as const;
```

- [ ] **Step 5: Run test to verify it passes**

Run: `DATABASE_URL=postgres://gctest:gctest@localhost:5432/gc_test JWT_SECRET=test-secret bun test apps/api/test/cookies.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Typecheck + format**

Run: `cd apps/api && bun run typecheck` → clean. Then from root: `bunx prettier --write apps/api/src/auth/cookies.ts apps/api/src/env.ts apps/api/test/cookies.test.ts`

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/auth/cookies.ts apps/api/src/env.ts apps/api/test/cookies.test.ts
git commit -m "feat(api): auth cookie config module (httpOnly/Lax options, TTLs, names)"
```

---

### Task 2: Refresh-token repository (scoped storage + lookup)

The `token` table becomes the refresh-token store. Scope every read/delete by `utenteId` **and** value (Phase-1 carryover: `removeToken` was value-only). Add `findToken` for refresh validation and generalize `updatePassword` → `update` so PATCH /me can also change the email (parity gap from Phase 1).

**Files:**
- Modify: `apps/api/src/utente/utente.repository.ts`
- Test: `apps/api/test/utente-repository.test.ts`

**Interfaces:**
- Consumes: `db` from `../db/client`; `utente`, `token` from `../db/schema`.
- Produces (repository object shape — later tasks depend on these exact names):
  - `findByEmail(email): Promise<{id;email;password} | null>`
  - `findById(id): Promise<{id;email;password} | null>`
  - `create(email, passwordHash): Promise<{id;email;...}>`
  - `update(id, fields: { email?: string; passwordHash?: string }): Promise<void>` *(replaces `updatePassword`)*
  - `remove(id): Promise<void>`
  - `addToken(utenteId, value): Promise<void>`
  - `findToken(utenteId, value): Promise<{ id: number; token: string; utenteId: number } | null>` *(new)*
  - `removeToken(utenteId, value): Promise<void>` *(now scoped by both)*
  - `removeAllTokens(utenteId): Promise<void>`

- [ ] **Step 1: Write the failing test**

Create `apps/api/test/utente-repository.test.ts`:

```typescript
import { test, expect, beforeEach } from 'bun:test';
import { db } from '../src/db/client';
import { createUtenteRepository } from '../src/utente/utente.repository';
import { resetDb } from './setup';

const repo = createUtenteRepository(db);
beforeEach(async () => {
  await resetDb();
});

test('findToken/removeToken are scoped by utenteId AND value', async () => {
  const a = await repo.create('a@b.it', 'h');
  const b = await repo.create('c@d.it', 'h');
  await repo.addToken(a.id, 'ra');
  await repo.addToken(b.id, 'rb');

  expect(await repo.findToken(a.id, 'ra')).not.toBeNull();
  // same value under the wrong user must not match
  expect(await repo.findToken(b.id, 'ra')).toBeNull();

  // removing a's token with b's id is a no-op
  await repo.removeToken(b.id, 'ra');
  expect(await repo.findToken(a.id, 'ra')).not.toBeNull();

  await repo.removeToken(a.id, 'ra');
  expect(await repo.findToken(a.id, 'ra')).toBeNull();
});

test('update changes email and/or password hash', async () => {
  const u = await repo.create('a@b.it', 'oldhash');
  await repo.update(u.id, { email: 'new@b.it', passwordHash: 'newhash' });
  const found = await repo.findById(u.id);
  expect(found!.email).toBe('new@b.it');
  expect(found!.password).toBe('newhash');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `DATABASE_URL=postgres://gctest:gctest@localhost:5432/gc_test JWT_SECRET=test-secret bun test apps/api/test/utente-repository.test.ts`
Expected: FAIL — `repo.findToken is not a function` / `repo.update is not a function`.

- [ ] **Step 3: Rewrite `apps/api/src/utente/utente.repository.ts`**

```typescript
import { and, eq } from 'drizzle-orm';
import type { db as Db } from '../db/client';
import { utente, token } from '../db/schema';

export const createUtenteRepository = (db: typeof Db) => ({
  findByEmail: async (email: string) =>
    (await db.select().from(utente).where(eq(utente.email, email)))[0] ?? null,
  findById: async (id: number) =>
    (await db.select().from(utente).where(eq(utente.id, id)))[0] ?? null,
  create: async (email: string, passwordHash: string) =>
    (await db.insert(utente).values({ email, password: passwordHash }).returning())[0]!,
  update: async (id: number, fields: { email?: string; passwordHash?: string }) => {
    const set: { email?: string; password?: string } = {};
    if (fields.email !== undefined) set.email = fields.email;
    if (fields.passwordHash !== undefined) set.password = fields.passwordHash;
    if (Object.keys(set).length === 0) return;
    await db.update(utente).set(set).where(eq(utente.id, id));
  },
  remove: async (id: number) => {
    await db.delete(utente).where(eq(utente.id, id));
  },
  addToken: async (utenteId: number, value: string) => {
    await db.insert(token).values({ utenteId, token: value });
  },
  findToken: async (utenteId: number, value: string) =>
    (
      await db
        .select()
        .from(token)
        .where(and(eq(token.utenteId, utenteId), eq(token.token, value)))
    )[0] ?? null,
  removeToken: async (utenteId: number, value: string) => {
    await db.delete(token).where(and(eq(token.utenteId, utenteId), eq(token.token, value)));
  },
  removeAllTokens: async (utenteId: number) => {
    await db.delete(token).where(eq(token.utenteId, utenteId));
  },
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `DATABASE_URL=postgres://gctest:gctest@localhost:5432/gc_test JWT_SECRET=test-secret bun test apps/api/test/utente-repository.test.ts`
Expected: PASS (2 tests). Note: the full suite is temporarily RED here (`utente.service.ts` still calls `updatePassword`); Task 3 fixes it.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/utente/utente.repository.ts apps/api/test/utente-repository.test.ts
git commit -m "feat(api): scope refresh-token repo by user + findToken + generalize update"
```

---

### Task 3: Auth service — access/refresh token model

Rework the service: login issues an access+refresh pair and stores the refresh; `refresh` validates + **rotates**; logout/logout-all revoke; update also changes email and revokes all sessions (force re-auth); remove clears tokens before deleting the user (FK). Delete the dead `me()` method (routes read `utente` straight from `authPlugin`).

**Files:**
- Modify: `apps/api/src/utente/utente.service.ts`
- Test: `apps/api/test/utente.test.ts` (rewritten in Task 5; this task ships service logic proven via Task 5's route tests — no standalone service test to avoid duplicating HTTP coverage)

**Interfaces:**
- Consumes: `createUtenteRepository` return type; `AuthError`, `BadRequestError` from `../errors`; `ACCESS_TTL`, `REFRESH_TTL` from `../auth/cookies`.
- Produces (service object — Task 5 routes depend on these):
  - `Jwt` type: `{ sign: (p: { id: string; type: 'access' | 'refresh'; exp: string }) => Promise<string>; verify: (t?: string) => Promise<false | { id?: unknown; type?: unknown }> }`
  - `register(email, password): Promise<{ id: number; email: string }>`
  - `login(email, password): Promise<{ utente: { id: number; email: string }; access: string; refresh: string }>`
  - `refresh(rawRefresh: string): Promise<{ utente: { id: number; email: string }; access: string; refresh: string }>`
  - `update(id, email: string | undefined, password: string): Promise<{ id: number; email: string }>`
  - `logout(id, rawRefresh: string): Promise<void>`
  - `logoutAll(id): Promise<void>`
  - `remove(id): Promise<void>`

- [ ] **Step 1: Write the service**

Replace the whole `apps/api/src/utente/utente.service.ts`:

```typescript
import { AuthError, BadRequestError } from '../errors';
import { ACCESS_TTL, REFRESH_TTL } from '../auth/cookies';
import type { createUtenteRepository } from './utente.repository';

type Jwt = {
  sign: (payload: { id: string; type: 'access' | 'refresh'; exp: string }) => Promise<string>;
  verify: (token?: string) => Promise<false | { id?: unknown; type?: unknown }>;
};

const hash = (password: string) =>
  Bun.password.hash(password, { algorithm: 'bcrypt', cost: 8 });

export const createUtenteService = (repo: ReturnType<typeof createUtenteRepository>, jwt: Jwt) => {
  // Mint a fresh pair and persist the refresh token for this user.
  const issue = async (id: number, email: string) => {
    const access = await jwt.sign({ id: String(id), type: 'access', exp: ACCESS_TTL });
    const refresh = await jwt.sign({ id: String(id), type: 'refresh', exp: REFRESH_TTL });
    await repo.addToken(id, refresh);
    return { utente: { id, email }, access, refresh };
  };

  return {
    register: async (email: string, password: string) => {
      const created = await repo.create(email, await hash(password));
      return { id: created.id, email: created.email };
    },
    login: async (email: string, password: string) => {
      const found = await repo.findByEmail(email);
      if (!found || !(await Bun.password.verify(password, found.password)))
        throw new AuthError('Email o password errate');
      return issue(found.id, found.email);
    },
    refresh: async (rawRefresh: string) => {
      const payload = rawRefresh ? await jwt.verify(rawRefresh) : false;
      if (!payload || payload.type !== 'refresh' || typeof payload.id !== 'string')
        throw new AuthError('Refresh token non valido');
      const id = Number(payload.id);
      if (!Number.isInteger(id)) throw new AuthError('Refresh token non valido');
      const stored = await repo.findToken(id, rawRefresh);
      if (!stored) throw new AuthError('Sessione scaduta');
      const found = await repo.findById(id);
      if (!found) throw new AuthError('Utente non trovato');
      // Rotate: the used refresh token is single-use.
      await repo.removeToken(id, rawRefresh);
      return issue(found.id, found.email);
    },
    update: async (id: number, email: string | undefined, password: string) => {
      if (!password) throw new BadRequestError('Password richiesta');
      await repo.update(id, { email, passwordHash: await hash(password) });
      // Credential change invalidates every existing session.
      await repo.removeAllTokens(id);
      const found = await repo.findById(id);
      return { id: found!.id, email: found!.email };
    },
    logout: (id: number, rawRefresh: string) => repo.removeToken(id, rawRefresh),
    logoutAll: (id: number) => repo.removeAllTokens(id),
    remove: async (id: number) => {
      await repo.removeAllTokens(id); // clear FK rows before deleting the user
      await repo.remove(id);
    },
  };
};
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/api && bun run typecheck`
Expected: clean (`utente.service.ts` no longer references `updatePassword`; `me()` removed).

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/utente/utente.service.ts
git commit -m "feat(api): access+refresh token service with rotation and real revocation"
```

---

### Task 4: authPlugin — verify the access cookie

Switch the guard from the `Authorization: Bearer` header to the `access` cookie. Verify signature, require `type === 'access'`, guard the id against non-integers, hydrate `utente`. Remove the global `exp: '14d'` from the JWT config (expiry is now per-sign). Access is stateless — no DB token check (revocation is handled by the short TTL + refresh store).

**Files:**
- Modify: `apps/api/src/auth/auth.plugin.ts`
- Test: covered by Task 5 (`/utente/me` with/without cookie) and Task 6 (guarded resource routes).

**Interfaces:**
- Consumes: `ACCESS_COOKIE` from `./cookies`; `AuthError` from `../errors`; `createUtenteRepository`.
- Produces:
  - `jwtConfig` — the `@elysiajs/jwt` plugin (name `'jwt'`, secret from env, **no** default `exp`).
  - `authPlugin` — scoped `.derive` that adds `{ utente: { id: number; email: string } }`; throws `AuthError` (→ 401) when the access cookie is missing/invalid.

- [ ] **Step 1: Rewrite `apps/api/src/auth/auth.plugin.ts`**

```typescript
import { Elysia } from 'elysia';
import jwtPlugin from '@elysiajs/jwt';
import { env } from '../env';
import { AuthError } from '../errors';
import { db } from '../db/client';
import { ACCESS_COOKIE } from './cookies';
import { createUtenteRepository } from '../utente/utente.repository';

const repo = createUtenteRepository(db);

// No default `exp`: access (15m) and refresh (14d) set expiry per-sign.
export const jwtConfig = jwtPlugin({ name: 'jwt', secret: env.JWT_SECRET });

export const authPlugin = new Elysia({ name: 'auth' })
  .use(jwtConfig)
  .derive({ as: 'scoped' }, async ({ jwt, cookie }) => {
    const raw = cookie[ACCESS_COOKIE]?.value;
    if (typeof raw !== 'string' || !raw) throw new AuthError('Non autenticato');
    const payload = await jwt.verify(raw);
    if (!payload || payload.type !== 'access' || typeof payload.id !== 'string')
      throw new AuthError('Token non valido');
    const id = Number(payload.id);
    if (!Number.isInteger(id)) throw new AuthError('Token non valido');
    const found = await repo.findById(id);
    if (!found) throw new AuthError('Utente non trovato');
    return { utente: { id: found.id, email: found.email } };
  });
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/api && bun run typecheck`
Expected: clean. (Note: `utente.routes.ts` still references the old `token` field and Bearer flow — RED until Task 5. This task is committed together with Task 5's route rewrite is acceptable, but keep the commit here scoped to the plugin; the suite goes green at end of Task 5.)

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/auth/auth.plugin.ts
git commit -m "feat(api): authenticate via httpOnly access cookie (stateless, type-checked)"
```

---

### Task 5: utente routes — cookies, `/refresh`, and cookie-based tests

Wire the service through the routes: login/refresh set cookies and return `{ utente }`; add public `POST /utente/refresh`; guarded logout/logout-all/PATCH/DELETE clear cookies; PATCH /me accepts optional email. Rewrite `utente.test.ts` for the cookie flow (the suite goes green here). Add the `UpdateMeInput` schema to shared-types.

**Files:**
- Modify: `packages/shared-types/src/utente.ts`
- Modify: `apps/api/src/utente/utente.routes.ts`
- Test (rewrite): `apps/api/test/utente.test.ts`

**Interfaces:**
- Consumes: `LoginInputSchema`, `UpdateMeInputSchema` from `@gc/shared-types`; `createUtenteService`; `authPlugin`, `jwtConfig`; `ACCESS_COOKIE`, `REFRESH_COOKIE`, `ACCESS_MAX_AGE`, `REFRESH_MAX_AGE`, `authCookieOptions` from `../auth/cookies`.
- Produces: `utenteRoutes` with routes `POST /utente/login`, `POST /utente`, `POST /utente/refresh`, `GET /utente/me`, `PATCH /utente/me`, `DELETE /utente/me`, `POST /utente/logout`, `POST /utente/logout-all`.

- [ ] **Step 1: Add the shared schema**

Append to `packages/shared-types/src/utente.ts`:

```typescript
export const UpdateMeInputSchema = Type.Object({
  email: Type.Optional(Type.String()),
  password: Type.String(),
});
export type UpdateMeInput = Static<typeof UpdateMeInputSchema>;
```

- [ ] **Step 2: Write the failing test (rewrite `apps/api/test/utente.test.ts`)**

```typescript
import { test, expect, beforeEach } from 'bun:test';
import { buildApp } from '../src/app';
import { resetDb } from './setup';

beforeEach(async () => {
  await resetDb();
});

// Return a `cookie:` header string (name=value pairs) from a response's Set-Cookie list.
const cookieHeader = (res: Response) =>
  res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');

const send = (path: string, method: string, body?: unknown, cookie?: string) =>
  buildApp().handle(
    new Request(`http://localhost${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(cookie ? { cookie } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );

// Register + login, returning the session cookie header.
const authenticate = async (email = 'a@b.it', password = 'pw') => {
  await send('/utente', 'POST', { email, password });
  const res = await send('/utente/login', 'POST', { email, password });
  expect(res.status).toBe(200);
  return cookieHeader(res);
};

test('login sets httpOnly access + refresh cookies and returns { utente }', async () => {
  await send('/utente', 'POST', { email: 'a@b.it', password: 'pw' });
  const res = await send('/utente/login', 'POST', { email: 'a@b.it', password: 'pw' });
  expect(res.status).toBe(200);
  const setCookies = res.headers.getSetCookie();
  expect(setCookies.some((c) => c.startsWith('access=') && /HttpOnly/i.test(c))).toBe(true);
  expect(setCookies.some((c) => c.startsWith('refresh=') && /HttpOnly/i.test(c))).toBe(true);
  const body = await res.json();
  expect(body.utente.email).toBe('a@b.it');
  expect(body.token).toBeUndefined(); // no bearer token in the body anymore
});

test('login with wrong password → 401', async () => {
  await send('/utente', 'POST', { email: 'a@b.it', password: 'pw' });
  expect((await send('/utente/login', 'POST', { email: 'a@b.it', password: 'nope' })).status).toBe(
    401,
  );
});

test('GET /utente/me requires the access cookie', async () => {
  const cookie = await authenticate();
  expect((await send('/utente/me', 'GET')).status).toBe(401);
  const me = await send('/utente/me', 'GET', undefined, cookie);
  expect(me.status).toBe(200);
  expect((await me.json()).email).toBe('a@b.it');
});

test('POST /utente/refresh rotates the session and returns { utente }', async () => {
  const cookie = await authenticate();
  const res = await send('/utente/refresh', 'POST', undefined, cookie);
  expect(res.status).toBe(200);
  expect((await res.json()).utente.email).toBe('a@b.it');
  // a new access cookie is issued
  expect(res.headers.getSetCookie().some((c) => c.startsWith('access='))).toBe(true);
});

test('refresh without a refresh cookie → 401', async () => {
  expect((await send('/utente/refresh', 'POST')).status).toBe(401);
});

test('logout revokes the refresh token (subsequent refresh → 401)', async () => {
  const cookie = await authenticate();
  expect((await send('/utente/logout', 'POST', undefined, cookie)).status).toBe(200);
  // same refresh cookie can no longer be rotated
  expect((await send('/utente/refresh', 'POST', undefined, cookie)).status).toBe(401);
});

test('PATCH /utente/me updates email + password and forces re-auth', async () => {
  const cookie = await authenticate();
  const res = await send('/utente/me', 'PATCH', { email: 'z@b.it', password: 'new' }, cookie);
  expect(res.status).toBe(200);
  expect((await res.json()).email).toBe('z@b.it');
  // old session revoked
  expect((await send('/utente/refresh', 'POST', undefined, cookie)).status).toBe(401);
  // can log in with the new password
  expect((await send('/utente/login', 'POST', { email: 'z@b.it', password: 'new' })).status).toBe(
    200,
  );
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `DATABASE_URL=postgres://gctest:gctest@localhost:5432/gc_test JWT_SECRET=test-secret bun test apps/api/test/utente.test.ts`
Expected: FAIL — routes still return `{ utente, token }` / no `/refresh` route / no cookies set.

- [ ] **Step 4: Rewrite `apps/api/src/utente/utente.routes.ts`**

```typescript
import { Elysia } from 'elysia';
import { LoginInputSchema, UpdateMeInputSchema } from '@gc/shared-types';
import { db } from '../db/client';
import { jwtConfig, authPlugin } from '../auth/auth.plugin';
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  ACCESS_MAX_AGE,
  REFRESH_MAX_AGE,
  authCookieOptions,
} from '../auth/cookies';
import { createUtenteRepository } from './utente.repository';
import { createUtenteService } from './utente.service';

const repo = createUtenteRepository(db);

type Jar = Record<string, { set: (c: Record<string, unknown>) => unknown }>;

const setSession = (cookie: Jar, access: string, refresh: string) => {
  cookie[ACCESS_COOKIE]!.set({ value: access, ...authCookieOptions(ACCESS_MAX_AGE) });
  cookie[REFRESH_COOKIE]!.set({ value: refresh, ...authCookieOptions(REFRESH_MAX_AGE) });
};

const clearSession = (cookie: Jar) => {
  cookie[ACCESS_COOKIE]!.set({ value: '', ...authCookieOptions(0) });
  cookie[REFRESH_COOKIE]!.set({ value: '', ...authCookieOptions(0) });
};

export const utenteRoutes = new Elysia({ prefix: '/utente' })
  .use(jwtConfig)
  .resolve({ as: 'scoped' }, ({ jwt }) => ({ service: createUtenteService(repo, jwt) }))
  // --- public ---
  .post(
    '/login',
    async ({ body, service, cookie }) => {
      const { utente, access, refresh } = await service.login(body.email, body.password);
      setSession(cookie as unknown as Jar, access, refresh);
      return { utente };
    },
    { body: LoginInputSchema },
  )
  .post(
    '/',
    ({ body, service, set }) => {
      set.status = 201;
      return service.register(body.email, body.password);
    },
    { body: LoginInputSchema },
  )
  .post('/refresh', async ({ cookie, service }) => {
    const raw = cookie[REFRESH_COOKIE]?.value;
    const { utente, access, refresh } = await service.refresh(typeof raw === 'string' ? raw : '');
    setSession(cookie as unknown as Jar, access, refresh);
    return { utente };
  })
  // --- guarded ---
  .use(authPlugin)
  .get('/me', ({ utente }) => utente)
  .patch(
    '/me',
    async ({ utente, body, service, cookie }) => {
      const updated = await service.update(utente.id, body.email, body.password);
      clearSession(cookie as unknown as Jar); // force re-auth after credential change
      return updated;
    },
    { body: UpdateMeInputSchema },
  )
  .delete('/me', async ({ utente, service, cookie }) => {
    await service.remove(utente.id);
    clearSession(cookie as unknown as Jar);
    return { message: 'ok' };
  })
  .post('/logout', async ({ utente, service, cookie }) => {
    const raw = cookie[REFRESH_COOKIE]?.value;
    await service.logout(utente.id, typeof raw === 'string' ? raw : '');
    clearSession(cookie as unknown as Jar);
    return { message: 'ok' };
  })
  .post('/logout-all', async ({ utente, service, cookie }) => {
    await service.logoutAll(utente.id);
    clearSession(cookie as unknown as Jar);
    return { message: 'ok' };
  });
```

- [ ] **Step 5: Run test to verify it passes**

Run: `DATABASE_URL=postgres://gctest:gctest@localhost:5432/gc_test JWT_SECRET=test-secret bun test apps/api/test/utente.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 6: Typecheck + format**

Run: `cd apps/api && bun run typecheck` (clean); `cd packages/shared-types && bun run typecheck` (clean). From root: `bunx prettier --write apps/api/src/utente/utente.routes.ts packages/shared-types/src/utente.ts apps/api/test/utente.test.ts`

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/utente/utente.routes.ts packages/shared-types/src/utente.ts apps/api/test/utente.test.ts
git commit -m "feat(api): cookie-based login/refresh/logout + PATCH /me email parity"
```

---

### Task 6: Guard `andamento` and `tipo-spesa` routes (close the Phase-1 hole)

The spec (§2.1) marks every `andamento`, `tipo-spesa`, and `statistiche` route auth-required; Phase 1 left `andamento`/`tipo-spesa` open. Add the guard and update their HTTP tests to carry a session cookie, plus a "no cookie → 401" case each.

**Files:**
- Modify: `apps/api/src/andamento/andamento.routes.ts`
- Modify: `apps/api/src/tipo-spesa/tipo-spesa.routes.ts`
- Test (rewrite): `apps/api/test/andamento.test.ts`, `apps/api/test/tipo-spesa.test.ts`

**Interfaces:**
- Consumes: `authPlugin` from `../auth/auth.plugin`.
- Produces: both route groups now reject unauthenticated requests with 401.

- [ ] **Step 1: Write the failing guard test (add to `apps/api/test/tipo-spesa.test.ts` first, as the smaller file)**

Rewrite `apps/api/test/tipo-spesa.test.ts`:

```typescript
import { test, expect, beforeEach } from 'bun:test';
import { buildApp } from '../src/app';
import { resetDb, seedFixtures } from './setup';

beforeEach(async () => {
  await resetDb();
  await seedFixtures();
});

const cookieHeader = (res: Response) =>
  res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');

const login = async () => {
  await buildApp().handle(
    new Request('http://localhost/utente', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'a@b.it', password: 'pw' }),
    }),
  );
  const res = await buildApp().handle(
    new Request('http://localhost/utente/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'a@b.it', password: 'pw' }),
    }),
  );
  return cookieHeader(res);
};

const get = (path: string, cookie?: string) =>
  buildApp().handle(
    new Request(`http://localhost${path}`, { headers: cookie ? { cookie } : {} }),
  );

test('GET /tipo-spesa without a session → 401', async () => {
  expect((await get('/tipo-spesa')).status).toBe(401);
});

test('GET /tipo-spesa returns all categories when authenticated', async () => {
  const cookie = await login();
  const res = await get('/tipo-spesa', cookie);
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body).toHaveLength(4);
  expect(body.map((t: { descrizione: string }) => t.descrizione)).toContain('spesa');
});

test('GET /tipo-spesa/:id → 404 when missing', async () => {
  const cookie = await login();
  expect((await get('/tipo-spesa/999', cookie)).status).toBe(404);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `DATABASE_URL=postgres://gctest:gctest@localhost:5432/gc_test JWT_SECRET=test-secret bun test apps/api/test/tipo-spesa.test.ts`
Expected: FAIL — `GET /tipo-spesa without a session → 401` gets 200 (route unguarded).

- [ ] **Step 3: Guard `tipo-spesa.routes.ts`**

Add the import and `.use(authPlugin)` immediately after `new Elysia({ prefix: '/tipo-spesa' })`:

```typescript
import { authPlugin } from '../auth/auth.plugin';
// ...
export const tipoSpesaRoutes = new Elysia({ prefix: '/tipo-spesa' })
  .use(authPlugin)
  // ...existing .get(...) chain unchanged...
```

- [ ] **Step 4: Guard `andamento.routes.ts` (same pattern)**

Add `import { authPlugin } from '../auth/auth.plugin';` and insert `.use(authPlugin)` right after `new Elysia({ prefix: '/andamento' })`, before the existing route chain.

- [ ] **Step 5: Rewrite `apps/api/test/andamento.test.ts` to authenticate**

Add the same `cookieHeader` + `login()` helpers at the top (copy from Step 1). Change the `req` helper to attach the cookie, and add a no-session case:

```typescript
import { test, expect, beforeEach } from 'bun:test';
import { buildApp } from '../src/app';
import { resetDb, seedFixtures } from './setup';

let cookie = '';
beforeEach(async () => {
  await resetDb();
  await seedFixtures();
  cookie = await login(); // defined below
});

const cookieHeader = (res: Response) =>
  res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');

const login = async () => {
  await buildApp().handle(
    new Request('http://localhost/utente', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'a@b.it', password: 'pw' }),
    }),
  );
  const res = await buildApp().handle(
    new Request('http://localhost/utente/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'a@b.it', password: 'pw' }),
    }),
  );
  return cookieHeader(res);
};

const req = (path: string, init: RequestInit = {}) =>
  buildApp().handle(
    new Request(`http://localhost${path}`, {
      ...init,
      headers: { ...(init.headers ?? {}), cookie },
    }),
  );

test('GET /andamento without a session → 401', async () => {
  const res = await buildApp().handle(new Request('http://localhost/andamento'));
  expect(res.status).toBe(401);
});
```

Then keep the **existing 8 tests unchanged** — they already call `req(...)`, which now injects the cookie automatically. (The `seedFixtures` also creates `tipo_spesa` rows needed by these tests; the extra `utente` row from `login()` does not affect andamento assertions.)

- [ ] **Step 6: Run the full suite**

Run: `DATABASE_URL=postgres://gctest:gctest@localhost:5432/gc_test JWT_SECRET=test-secret bun test`
Expected: PASS — all files green (andamento now 9 tests, tipo-spesa 3, utente 7, plus cookies 2, utente-repository 2, statistiche 3, errors 3, health).

- [ ] **Step 7: Typecheck + format + commit**

```bash
cd apps/api && bun run typecheck   # clean
cd ../.. && bunx prettier --write apps/api/src/andamento/andamento.routes.ts apps/api/src/tipo-spesa/tipo-spesa.routes.ts apps/api/test/andamento.test.ts apps/api/test/tipo-spesa.test.ts
git add apps/api/src/andamento/andamento.routes.ts apps/api/src/tipo-spesa/tipo-spesa.routes.ts apps/api/test/andamento.test.ts apps/api/test/tipo-spesa.test.ts
git commit -m "fix(api): guard andamento + tipo-spesa routes (close phase-1 auth gap)"
```

---

### Task 7 (OPTIONAL — recommend deferring to Fase 4): CSRF custom-header guard + explicit CORS origin

Spec §6/§12 decided CSRF mitigation = `SameSite=Lax` + a **required custom header** on state-changing requests, and CORS with an explicit origin (not `*`) since credentialed requests forbid `*`. **Recommendation:** defer enforcement to Fase 4 when the real client (Eden/TanStack) exists to send the header — enforcing it now adds a required header to every mutating test for zero runtime benefit until the deployed cross-subdomain topology exists (Fase 6). If you implement now, do it as an isolated plugin so it is trivially toggled.

**Files (if implemented now):**
- Create: `apps/api/src/auth/csrf.plugin.ts`
- Modify: `apps/api/src/app.ts` (wire the plugin; set CORS origin from `env.CORS_ORIGIN`, and in prod require it to be explicit)
- Modify: mutating tests to send the header (`x-gc-csrf: 1`)
- Test: `apps/api/test/csrf.test.ts`

**Interfaces:**
- Produces: `csrfPlugin` — `onRequest`/`onBeforeHandle` that rejects `POST|PUT|PATCH|DELETE` lacking header `x-gc-csrf` with 403 (`BadRequestError`/dedicated `ForbiddenError`). Exempts nothing — login/register/refresh are same-site app calls that also send it.

- [ ] **Step 1: Write the failing test** — `csrf.test.ts`: a mutating request without `x-gc-csrf` → 403; with it → proceeds (401/200 per auth, not 403).
- [ ] **Step 2: Implement `csrf.plugin.ts`** as a scoped `onBeforeHandle` guard keyed on `request.method` and `headers['x-gc-csrf']`.
- [ ] **Step 3: Wire into `app.ts`**, set `cors({ origin: env.CORS_ORIGIN, credentials: true })` (already present) and document that prod must set `CORS_ORIGIN` to the explicit `app.<domain>`.
- [ ] **Step 4:** Add `x-gc-csrf: 1` to every mutating request in `utente.test.ts` and `andamento.test.ts`.
- [ ] **Step 5:** Full suite green; typecheck; format; commit `feat(api): CSRF custom-header guard + explicit CORS origin`.

---

## Phase-2 exit criteria

- Full suite green from root: `DATABASE_URL=... JWT_SECRET=test-secret bun test`.
- `bun run --filter '*' typecheck` clean; `prettier --check .` clean (CI gates).
- All 20 spec routes present; `andamento`/`tipo-spesa`/`statistiche`/`/utente/me*` reject unauthenticated requests (401); `/utente/login`, `POST /utente`, `POST /utente/refresh` remain public.
- Logout/logout-all/PATCH-me revoke refresh tokens for real (proven by "subsequent refresh → 401").
- Open a PR to `master` so CI runs (Phase-1 note: CI triggers on `master`).

## Deferred to later phases (tracked, not lost)

- **Fase 4:** CSRF header enforcement (Task 7) once the client can send it; explicit `CORS_ORIGIN` set for the deployed `app.<domain>`.
- **Fase 6:** custom domain provisioning (`api.<domain>` + `app.<domain>`), `COOKIE_DOMAIN`/`COOKIE_SECURE=true` in prod env.
- **Backlog (low):** `utente.repository` still returns the `password` column on `findById`/`findByEmail` (service re-projects to `{id,email}`); tighten if a future caller risks leaking it.
