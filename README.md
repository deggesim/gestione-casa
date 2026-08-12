# gestione-casa

Monorepo for Gestione Casa frontend and backend

## Deploy (Railway)

Both apps run as two services in the **existing** Railway project, next to the legacy
`gc-server` / `gc-frontend` services, on the **same** Postgres and the same `gc` schema. This
section is the only record of configuration that otherwise lives only in the Railway
dashboard. Design rationale: `docs/superpowers/specs/2026-08-11-phase6-cutover-design.md`.

### Topology

```
Railway project (existing)
 │
 ├─ Postgres                      unchanged — private network, gc schema
 ├─ gc-server    legacy           unchanged, stays up
 ├─ gc-frontend  legacy           unchanged, stays up
 │
 ├─ api    gestione-casa-api.up.railway.app     (public, manual debugging only)
 │         binds :: — port 5000
 │
 └─ web    gestione-casa.up.railway.app         (the host people use)
           binds :: — port 3000
             ├─ /api/*  ──fetch──▶  api.railway.internal:5000     private network
             └─ /*      ──────────▶  dist/  (serve.ts, SPA fallback)
```

**Why the browser never talks to the api directly.** `up.railway.app` is on the Public
Suffix List, so two Railway subdomains are two distinct *sites*, and `COOKIE_DOMAIN` cannot
be set to `.up.railway.app`. Cross-site session cookies need `SameSite=None`, which WebKit
blocks — the app would simply not log in on iPhone or Safari. One public origin, with
`/api/*` proxied over the private network, removes the problem instead of working around it.
A custom domain would also solve it and was declined (annual registration cost).

### Service `api`

| Variable | Value | Notes |
|---|---|---|
| `DATABASE_URL` | reference `${{Postgres.DATABASE_URL}}` | Same Postgres as legacy, over the private network |
| `JWT_SECRET` | a **new** secret, different from legacy | Keeps the two stacks' sessions independent |
| `CORS_ORIGIN` | `https://gestione-casa.up.railway.app` | Mandatory in production (`apps/api/src/env.ts` refuses to boot without it) |
| `COOKIE_SECURE` | `true` | Mandatory in production (same check) |
| `COOKIE_DOMAIN` | **unset** | Host-only cookies — correct for a single origin, and impossible on a public suffix anyway |
| `PORT` | `5000` | Explicit: `API_INTERNAL_URL` on the web service hardcodes this port |
| `RAILWAY_DOCKERFILE_PATH` | `apps/api/Dockerfile` | Railpack does not detect Bun projects |

### Service `web`

| Variable | Value | When it acts |
|---|---|---|
| `PUBLIC_API_URL` | `https://gestione-casa.up.railway.app/api` | **Build time** — inlined into the bundle. Declared as `ARG` in the Dockerfile; without that it stays a literal `process.env.PUBLIC_API_URL` and the page is blank on first load |
| `PUBLIC_ENABLE_SW` | `true` | **Build time** — enables service-worker registration |
| `API_INTERNAL_URL` | `http://api.railway.internal:5000` | **Runtime** — read by `serve.ts`. Deliberately no `PUBLIC_` prefix: a private address has no business in a bundle. ⚠️ The hostname is the api **service name** on the dashboard — confirm it there |
| `PORT` | injected by Railway | **Runtime** — do not set by hand |
| `RAILWAY_DOCKERFILE_PATH` | `apps/web/Dockerfile` | |

Do **not** set `NODE_ENV` on either service. The api's `start` script sets it (that is what
arms the mandatory `CORS_ORIGIN` / `COOKIE_SECURE` checks), and the web's `build` script sets
it (that is what puts React in production mode). A service variable would make the deployed
bundle differ from the one `smoke` and `preview` verify locally — the exact condition that let
a development-mode React bundle ship unnoticed.

### Root directory and healthchecks

| Service | Root directory | `healthcheckPath` |
|---|---|---|
| api | `/` | `/health` |
| web | `/` | `/` |

Root directory stays `/` for both: Bun workspaces need the root `package.json` and `bun.lock`,
so pointing a service at `apps/api` would break the `@gc/shared-types: workspace:*` dependency.
The per-service Dockerfile is selected by `RAILWAY_DOCKERFILE_PATH`, not by the root directory.

The web healthcheck is `/` (i.e. `dist/index.html`), deliberately **not** `/api/health`: that
would tie the frontend's deployability to the api being up. `/api/health` through the proxy is
the first *manual* check after a deploy — one line that proves both that the proxy forwards and
that the private network resolves.

### Deploy sequence

1. Merge the phase branch into `master` and let CI go green (lint, typecheck, test, bundle
   smoke). CI does **not** build the Docker images, so Railway performs the first real image
   build.
2. Create the **api** service from the `gestione-casa` repo: variables above, root directory
   `/`, healthcheck `/health`, public domain `gestione-casa-api.up.railway.app`.
3. Create the **web** service: variables above, root directory `/`, healthcheck `/`, public
   domain `gestione-casa.up.railway.app`.
4. Check the api logs for `API listening on port 5000 (dual-stack)`. A service listening on
   `0.0.0.0` is reachable from the public edge and invisible to the internal proxy —
   `ECONNREFUSED` on a deploy that looks successful.
5. Run the manual checks below.
6. Leave the legacy services alone.

### Post-deploy checks

```bash
curl -s https://gestione-casa.up.railway.app/api/health          # {"status":"ok"} — proxy + private DNS
curl -s "https://gestione-casa.up.railway.app/api//example.com/" # Elysia's 404, NOT example.com
curl -s -o /dev/null -w '%{http_code}\n' \
  https://gestione-casa-api.up.railway.app/utente/me             # 401 — public api answers and refuses
```

The second one matters: a proxy that composes its target with `new URL(path, base)` forwards
`/api//example.com/` to `example.com` **carrying the victim's httpOnly session cookies**. The
proxy is written so it cannot (see §4 of the spec); this check confirms it in production.

Then, in a real browser on production data: login (session cookie on
`gestione-casa.up.railway.app`, `HttpOnly`, `Secure`, **no** `Domain`), reload keeps the
session, logout clears it, full `andamento` CRUD, all six `statistiche` screens draw, profile
save signs you out (expected), deep link to `/statistiche/casa` loads the app rather than a
404, the service worker registers and no `/api/*` response appears in Cache Storage, and —
the reason for this whole topology — **login from an iPhone or from Safari**.

### Reproducing the production topology locally

Same shape as production (one origin, real cookies, no preflight), no Railway account needed:

```bash
bun run --filter '@gc/api' dev

cd apps/web && PUBLIC_API_URL=http://localhost:3000/api API_INTERNAL_URL=http://localhost:5000 \
  PUBLIC_ENABLE_SW=true bun run preview
```

Open `http://localhost:3000`. In DevTools the `access` / `refresh` cookies must sit on
`localhost:3000` (not `:5000`) and there must be **no `OPTIONS` preflight** — that absence is
the proof the origin is single. If login fails here it will fail in production, with a much
longer diagnosis loop.

### Rollback

Nothing to restore. The legacy stack is up and untouched at its own addresses, on the same
data; rolling back means continuing to use it. The new services can be deleted or stopped
with no data consequences.

### Both stacks on one database

They share `gc.utente` and `gc.token`:

- A password change on the new stack (`PATCH /utente/me`) revokes **all** refresh tokens,
  deleting `gc.token` rows the legacy app uses too — so the legacy session gets signed out.
  Same person, so it is acceptable, but it is not worth diagnosing twice.
- The `JWT_SECRET`s differ on purpose: a token from one stack is invalid in the other.

### Decommissioning legacy (when the time comes)

Stop the `gc-server` and `gc-frontend` services in the Railway project. No data migration and
no DNS work: the new hosts are new hosts. The legacy repos stay as history.
