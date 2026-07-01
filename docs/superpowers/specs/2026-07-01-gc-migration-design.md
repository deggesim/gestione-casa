# Migrazione Gestione Casa → Monorepo Bun / Elysia / React — Design

- **Data:** 2026-07-01
- **Stato:** approvato (design) — pronto per il piano di implementazione
- **Repo target:** `gestione-casa` (branch principale: `master`)
- **Natura:** migrazione **tecnica/architetturale**. La logica di business e i requisiti applicativi restano invariati (unica eccezione voluta: hardening dell'autenticazione, vedi §6).

---

## 1. Obiettivo

Portare i due progetti esistenti — `gc-frontend` (Angular 19) e `gc-server` (Koa 2 + TypeORM) — in un unico monorepo `gestione-casa` sul nuovo stack:

- **Frontend:** React 19 + TypeScript, bundler **nativo di Bun** (`bun ./index.html` in dev, `bun build` in prod). Nessun Vite, nessun webpack.
- **Backend:** runtime **Bun**, framework HTTP **Elysia**, **Drizzle ORM** su driver nativo **Bun.sql**.
- **DB:** PostgreSQL invariato (schema `gc`, stesse tabelle).
- **Monorepo:** Bun workspaces (`apps/web`, `apps/api`, `packages/shared-types`).

Il comportamento osservabile (endpoint, shape dei dati, calcoli statistici, flussi UI) deve restare identico salvo l'auth.

---

## 2. Stato attuale (inventario reale)

### 2.1 Backend `gc-server`

**20 route** (path e metodi da preservare):

| Metodo | Path | Auth |
|---|---|---|
| POST | `/utente/login` | **no** |
| POST | `/utente` (register) | **no** |
| POST | `/utente/logout` | sì |
| POST | `/utente/logout-all` | sì |
| GET | `/utente/me` | sì |
| PATCH | `/utente/me` | sì |
| DELETE | `/utente/me` | sì |
| GET | `/andamento` | sì |
| GET | `/andamento/:id` | sì |
| POST | `/andamento` | sì |
| PUT | `/andamento/:id` | sì |
| DELETE | `/andamento/:id` | sì |
| GET | `/tipo-spesa` | sì |
| GET | `/tipo-spesa/:id` | sì |
| GET | `/statistiche/spese-frequenti/:interval` | sì |
| GET | `/statistiche/spesa/:interval` | sì |
| GET | `/statistiche/carburante/:interval` | sì |
| GET | `/statistiche/bolletta/:interval` | sì |
| GET | `/statistiche/casa/:interval` | sì |
| GET | `/statistiche/tutto/:interval` | sì |

`:interval` = enum `Interval`: `M` (mese), `Y` (anno), `A` (tutto).

**Modelli (TypeORM → schema `gc`):**
- `utente(id PK serial, email, password[bcrypt], tokens[1:N])`
- `andamento(id PK serial, giorno date, descrizione, costo decimal, tipo_spesa_id FK→tipo_spesa)`
- `tipo_spesa(id PK serial, descrizione)`
- `token(id PK serial, token, utente_id FK→utente)`

**Logica statistica (il punto a rischio più alto).** Vive in SQL raw PostgreSQL in `AndamentoRepository`:
- `speseFrequenti(interval)`: `SELECT ts.descrizione AS name, SUM(a.costo) AS value ... GROUP BY ts.id ORDER BY value DESC`, con filtro `WHERE giorno > NOW() - interval '1 MONTH'|'1 YEAR'` per M/Y, nessun filtro per A.
- `statistics(interval, tipoSpesa?)`: CTE con `generate_series` + `date_trunc` + `right join` su mesi/anni per riempire i buchi con 0, `coalesce(sum(costo),0)`, formato `YYYYMM` (mensile, `limit 48`) o `YYYY` (annuale). **Set ID categoria hardcoded e incoerenti tra loro — da portare VERBATIM:**
  - default mensile (se `tipoSpesa` assente): `in (1,2,3,5,7,9,13,16)`
  - default annuale: `in (1,3,7,9,10,13,16)`
  - `StatisticheService` passa singoli ID: spesa=1, carburante=2, bolletta=3, casa=7; `tutto`=nessun ID (usa i default sopra).
- Shape di risposta: `IStatistica[]` = `{ name: string, value: number }[]`. Prefisso schema `gc.` hardcoded nelle stringhe SQL.

**Auth attuale:** JWT **HS256 simmetrico** (secret env `PUBLIC_KEY`), scadenza **14 gg**, payload `{ id }`. Verifica solo di firma (`koa-jwt`); la tabella `Token` è salvata ma **non consultata** in verifica → logout/logout-all oggi non revocano davvero. bcryptjs (8 round). Middleware idrata `ctx.state.utente` da `find(id)`.

**Config/bootstrap:** `DATABASE_URL` (parse pg-connection-string), schema `gc`, SSL sempre on (`rejectUnauthorized:false`), porta 5000, CORS, koa-bodyparser, koa-logger. Errori: `BadRequestEntity`→400, `EntityNotFoundError`→404, login fallito→401, mapping per-controller (nessun handler globale). `experimentalDecorators`/`emitDecoratorMetadata` richiesti da typescript-ioc + TypeORM. `luxon`/`lodash` importati ma **non usati** lato server. Env `VAPID_*` presenti ma **inutilizzate**.

### 2.2 Frontend `gc-frontend`

- **8 route** (`/home`, `/login`, `/statistiche` + 4 figlie protette da `AuthGuard`, `/error`, redirect, wildcard). Route `data` guida breadcrumb, `period` (M/Y), `showMainPage`.
- **Service HTTP → 12 endpoint** (mappano il backend sopra). Base = `environment.endpoint` (dev `http://localhost:5000`, prod `https://gc-server.up.railway.app`).
- **Modelli:** `Utente`, `Token`, `Andamento`, `TipoSpesa`, `Statistica{name,value}`, `StatisticaMultipla{name,series[]}`, `Tipologica`.
- **Auth/sessione:** JWT in `localStorage` (`token`, `expires_at`, `utente`), `isLoginSubject` (BehaviorSubject) fonte di verità, `jwt-decode` per `exp`. `AuthGuard` su `/statistiche`. Due interceptor: `AuthInterceptor` (Bearer) e `GlobalInterceptor` (spinner + toast errori + redirect su 401/403).
- **Stato:** service-based (RxJS), niente NgRx. `ThemeService` (dark/light → `data-bs-theme`, localStorage), `SpinnerService` (contatore), `SharedService` (toastr). **7 resolver** che pre-fetchano dati per le route (pattern chiave da mappare).
- **Grafici (ngx-charts):** 4 bar orizzontali (bolletta, spesa, carburante, casa) + 1 torta (spese-frequenti).
- **Form:** reactive forms; `modifica` con datepicker (bsDatepicker IT), currency mask (ngx-currency it-IT/EUR, decimali virgola, `costo` min 0.01), select tipoSpesa (ng-select). Login (email/password required). Profilo (cambio password con conferma).
- **PWA completa:** ngsw (caching offline di `/andamento`, `/tipo-spesa`, `/statistiche`), `AppUpdateService` (prompt update + reload), `manifest.webmanifest` + icone.
- **Locale:** it-IT + EUR (`Intl.NumberFormat`, luxon `MMMM yyyy`, `LOCALE_ID`/`DEFAULT_CURRENCY_CODE`).

---

## 3. Architettura monorepo

```
gestione-casa/
├── package.json            # private, "workspaces": ["apps/*", "packages/*"]
├── bunfig.toml
├── tsconfig.base.json      # TS strict condiviso
├── .github/workflows/ci.yml
├── apps/
│   ├── web/                # React 19 — bundler nativo Bun
│   │   ├── index.html
│   │   └── src/
│   └── api/                # Elysia su Bun
│       ├── src/
│       └── drizzle/        # schema Drizzle + config
└── packages/
    └── shared-types/       # DTO + schemi TypeBox condivisi
```

`web` e `api` dipendono da `@gc/shared-types` (`workspace:*`). `web` importa `type App` da `api` come import solo-tipo (per Eden Treaty).

---

## 4. Backend — `apps/api` (Elysia + Drizzle + Bun.sql)

Mappatura degli strati (preservando route e status code):

| Oggi | Target |
|---|---|
| DI `typescript-ioc` (`@Singleton`/`@Inject`), decoratori | **Rimosso.** Servizi come **factory function** `createAndamentoService(db)` → oggetto con metodi (stile funzionale, no `class`). Niente `experimentalDecorators`. |
| `Routes` classes + `koa-router` | Un plugin Elysia per risorsa: `new Elysia({ prefix: '/andamento' })`, montati sull'app root. Path/metodi identici. |
| Controllers | Handler Elysia sottili + **`.onError` globale** che mappa `BadRequestError→400`, `NotFoundError→404`, `AuthError→401` (centralizza il try/catch per-controller). |
| Services | Factory function, logica invariata (validazione tipoSpesa, ecc.). |
| Repositories (TypeORM QueryBuilder) | Drizzle query builder. |
| **SQL raw statistiche** | **`db.execute(sql\`…\`)` VERBATIM**: stesse query, stessi set ID `(1,2,3,5,7,9,13,16)` mensile / `(1,3,7,9,10,13,16)` annuale, singoli ID spesa=1/carburante=2/bolletta=3/casa=7, stesso prefisso `gc.`. |
| `@Entity` | `pgTable` Drizzle nello schema `gc`. Bootstrap via `drizzle-kit pull` (introspezione del DB esistente), poi curato. |
| `data-source.ts` (pg, SSL) | Drizzle su **`Bun.sql`** (`drizzle-orm/bun-sql`) da `DATABASE_URL`, SSL, schema `gc`. |
| `bcryptjs` | **`Bun.password`** nativo (verifica gli hash bcrypt esistenti → zero dipendenze, retrocompatibile). |
| `env-cmd` + config/*.env | `.env` nativo di Bun. Env: `DATABASE_URL`, `JWT_SECRET`, `TZ`, `PORT`, + cookie/CORS auth. Env `VAPID_*` **eliminate**. |

Validazione input via schemi TypeBox condivisi (da `shared-types`) sulle route Elysia (`t.Object`).

---

## 5. Condivisione tipi

Due strumenti complementari:

- **`packages/shared-types`** — DTO di dominio + **schemi di validazione TypeBox** (validatore nativo di Elysia): `Andamento`, `TipoSpesa`, `Utente`, `Statistica`, enum `Interval`, DTO request/response. Un solo punto di verità per le shape; lo stesso schema valida a runtime lato API ed esporta il tipo per il frontend.
- **Eden Treaty** — client API tipizzato end-to-end inferito da `type App` di Elysia. Sostituisce i service Angular; metodo/path/params/body/response compile-checked. `web` importa `type App` come solo-tipo.

Catena: `shared-types` (TypeBox) → Elysia valida/infierisce → Eden tipizza `web`.

---

## 6. Auth — hardening (cookie httpOnly + refresh token)

- Plugin `@elysiajs/jwt`. **Access token** ~**15 min** + **refresh token** ~**14 gg**, entrambi in **cookie httpOnly `Secure`**.
- La tabella `Token` **diventa realmente usata** (store dei refresh token) → `logout`/`logout-all` revocano davvero; rotazione del refresh a ogni uso.
- Endpoint: `POST /utente/login` (verifica `Bun.password` → set cookie, body `{ utente }`), **`POST /utente/refresh`** (nuovo — ruota il refresh), `logout`/`logout-all` (cancella riga/righe + pulisce cookie).
- **Dominio custom (deciso):** `app.<dominio>` + `api.<dominio>` sullo stesso registrable domain → cookie **same-site** `SameSite=Lax`. È **prerequisito di deploy** per la Fase 2.
- **CSRF (deciso):** `SameSite=Lax` + requisito di **header custom** sulle richieste mutanti (un cross-site non può impostarlo senza preflight CORS). Double-submit token come hardening opzionale.
- CORS: origin esplicito (`app.<dominio>`) con `credentials`.

Il resto del contratto (register, `/utente/me`, update, delete) resta invariato.

---

## 7. Frontend — `apps/web` (React 19 + bundler Bun)

- **Bundler:** `bun ./index.html` (dev), `bun build ./index.html --outdir dist` (prod). Nessun altro bundler.
- **Routing:** **TanStack Router** in **code-based routing** (nessun plugin di build → compatibile col bundler Bun). Route tipizzate end-to-end.
  - I toggle **M/Y/A** diventano **search param tipizzati e validati** in URL (`?period=M`), rimpiazzando lo stato manuale dei 6 schermi statistiche.
  - `data:{breadcrumb, showMainPage}` Angular → `staticData` tipizzato delle route.
- **Stato server:** **TanStack Query** (integrazione nativa con TanStack Router). I **resolver Angular → loader di route** che chiamano `queryClient.ensureQueryData`. Cache/refetch sostituiscono anche in parte la freshness di ngsw.
- **Client dati:** **Eden Treaty** avvolto in hook TanStack Query (`useAndamentoList()`, `useSpesa(period)`, …).
- **Interceptor → equivalenti:**
  - `AuthInterceptor` (Bearer) → **eliminato** (cookie automatico, `credentials:'include'`).
  - `GlobalInterceptor` → callback globali `QueryCache/MutationCache` (toast errori + su 401: un tentativo di `refresh`, poi redirect `/login`); spinner globale via `useIsFetching()`/`useIsMutating()`.
- **Stato app:** auth = query `['me']` + hook `useAuth()`; tema = hook `useTheme()` (`data-bs-theme` + localStorage, invariato); spinner = indicatore globale.

**Sostituzione dipendenze UI:**

| Angular | React |
|---|---|
| `@swimlane/ngx-charts` (4 bar + 1 torta) | **Recharts** (`BarChart` + `PieChart`) |
| `ngx-bootstrap` (modal/dropdown/pagination/tooltip/collapse/buttons) | **React-Bootstrap** (look Bootstrap 5 invariato) |
| datepicker `ngx-bootstrap` | **`<input type="date">` nativo** |
| `ng-select` (categoria) | **`<select>` nativo** |
| `ngx-currency` (mask it-IT/EUR) | **react-currency-input-field** |
| `ngx-toastr` | **sonner** |
| `@fortawesome/angular-fontawesome` | **@fortawesome/react-fontawesome** |
| `ngx-device-detector` | **`window.matchMedia`** nativo → dep eliminata |
| `luxon` | **luxon** (invariato) |
| `bootstrap` + `bootswatch` | invariati (CSS) |
| `jwt-decode` | **eliminata** (auth via cookie) |

- **Form & validazione:** **React Hook Form** + resolver sullo schema **TypeBox condiviso** (parità: required, `costo` min 0.01). Locale it-IT/EUR via `Intl.NumberFormat` + luxon.
- **PWA:** si mantiene **solo `manifest.webmanifest` + icone** (installabile). Si rimuovono service worker ngsw e `AppUpdateService`; **nessuna cache offline API**.

---

## 8. Testing

- **`bun test`** (nativo): servizi API, auth, e **test di caratterizzazione sulle 6 statistiche** — stesso DB, si asserisce output `{name,value}[]` nuovo == vecchio backend. De-risking primario della porting SQL.
- **Playwright** (skill `playwright-best-practices`): E2E su login, CRUD andamento, i 5 schermi statistiche.
- Component test React con `bun test` + Testing Library: leggeri, solo componenti chiave.

---

## 9. Deploy / CI

- **Railway, 2 servizi** dal monorepo (root dir per servizio): `apps/api` (runtime Bun) e `apps/web` (build statico servito da micro-server Bun/static). Dominio custom `api.<dominio>` + `app.<dominio>`.
- **GitHub Actions** su PR e push a **`master`**: `bun install` → typecheck (`tsc --noEmit` sui workspace) → lint → `bun test` → `bun build` web → smoke Playwright opzionale. Deploy Railway agganciato a **`master`**.

---

## 10. Fasi di migrazione (ordine anti-rischio)

- **Fase 0 — Scaffold monorepo.** Bun workspaces, `tsconfig.base`, skeleton `shared-types`, CI base. Rischio nullo.
- **Fase 1 — Backend Elysia+Drizzle a contratto identico.** Introspezione DB (`drizzle-kit pull`), schema Drizzle, repository (SQL raw verbatim), servizi factory, route, `.onError`. **Mantiene l'auth vecchia (Bearer)** per isolare il rischio → parità funzionale verificata coi test di caratterizzazione sullo stesso DB.
- **Fase 2 — Hardening auth.** Cookie httpOnly + refresh + `/utente/refresh` + revoca reale. Prerequisito: dominio custom. Step discreto *dopo* la parità funzionale.
- **Fase 3 — Shared types + Eden Treaty.** Finalizza schemi TypeBox, esporta `type App`, aggancia Eden.
- **Fase 4 — Frontend React.** Scaffold bundler Bun + React 19, TanStack Router (code-based) + TanStack Query + Eden, porting schermo-per-schermo (lista, modifica, login, profilo, 5× statistiche, header/layout), sostituzione dep UI, form, tema/spinner/toast, manifest.
- **Fase 5 — Testing.** Completa `bun test` + Playwright sul nuovo stack.
- **Fase 6 — Cutover.** Deploy 2 servizi, dominio custom, smoke test, switch, monitoraggio, poi il resto lo gestisce l'utente.

---

## 11. Rischi & mitigazioni

- **Bundler nativo Bun — scelta consapevole da monitorare.** Non ha ancora feature parity con Vite su **React Fast Refresh** (HMR potenzialmente meno fluido) e ha **ecosistema di plugin più limitato** (nessun plugin PWA maturo → manifest-only; niente plugin file-based router → TanStack Router code-based). Nessun bundler di fallback previsto (vincolo esplicito). Da tenere sotto osservazione durante lo sviluppo; se blocca l'HMR, si degrada a full-reload in dev.
- **Parità SQL statistiche** = item di correttezza a rischio più alto → **test di caratterizzazione obbligatori** contro lo stesso DB. Portare gli ID hardcoded verbatim, non "ripulire".
- **Cookie cross-site** (auth cookie + 2 servizi) → mitigato dal **dominio custom same-site** + CSRF header custom. Senza dominio custom la Fase 2 è bloccata.
- **Rimozione decoratori/DI** → tocca ogni service, ma semplifica (factory function). Basso rischio.
- **TLS Postgres.** Il backend attuale usa `ssl: { rejectUnauthorized: false }` (verifica TLS disabilitata → esposto a MITM). Da **non** trascinare così: nel nuovo `Bun.sql`/Drizzle usare SSL con la CA del provider (Railway) o un certificato valido. È config di sicurezza, non logica di business.

---

## 12. Decisioni fissate

Testing = `bun test` + Playwright · Auth = hardening cookie httpOnly + refresh (TTL 15 min / 14 gg) · CSRF = SameSite=Lax + header custom · Dominio custom = sì · PWA = solo manifest installabile · Deploy = Railway 2 servizi · CI = GitHub Actions su `master` · Grafici = Recharts · Router = TanStack Router (code-based) · Tipi = shared-types TypeBox + Eden Treaty · Env `VAPID_*` = eliminate.

## 13. Fuori scope

- Modifiche a logica di business / calcoli / requisiti applicativi.
- Data migration (DB e schema `gc` invariati).
- Archiviazione/dismissione dei vecchi repo `gc-frontend`/`gc-server` (gestita dall'utente).
