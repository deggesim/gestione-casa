# Fase 3 — Shared types + Eden Treaty — Design

- **Data:** 2026-07-03
- **Stato:** approvato (design) — pronto per il piano di implementazione
- **Repo target:** `gestione-casa` (branch di lavoro previsto: `feat/phase3-shared-types-eden` off `master`)
- **Spec padre:** `docs/superpowers/specs/2026-07-01-gc-migration-design.md` §5, §10 (Fase 3), §12
- **Natura:** migrazione tecnica. Nessun cambiamento di logica di business. Unico cambiamento osservabile deliberato: `costo` e `statistica.value` passano da stringa numerica (`"220.00"`) a numero (`220`) sul filo — valore identico, tipo onesto.

---

## 1. Obiettivo e confini

Rendere il contratto API **tipizzato end-to-end e consumabile** dal futuro frontend, **senza ancora costruire il frontend**. Tre deliverable:

- **A** — l'API esporta `type App` (oggi non lo fa → Eden non ha nulla da inferire).
- **B** — response schema TypeBox su **tutte le 20 route**, con `shared-types` come unica fonte di verità anche per le uscite; coercizione numerica di `costo`/`value`.
- **C** — installazione e aggancio di **Eden Treaty**, provato da un test di contratto in-memory.

**`apps/web` NON viene toccato in Fase 3** (resta il placeholder attuale). Il client Eden avvolto in hook TanStack Query è Fase 4. Fase 3 prova il contratto con un test dentro `apps/api`.

### Decisioni fissate in brainstorming
- **Response contract:** schema TypeBox su tutte le route (fonte unica + validazione runtime delle uscite). *Non* solo-inferenza.
- **`costo` / `statistica.value`:** **coerciti a `number`** nel repository; response schema `Type.Number()`. Il DB emette stringhe numeriche (pg `numeric` → stringa via `SUM`/TypeORM legacy); il nuovo contratto è onesto e il frontend React (Fase 4) riceve numeri veri.
- **Test di contratto:** in `apps/api`, via `treaty(buildApp())` in-memory (no HTTP).

---

## 2. Stato di partenza (verificato)

Già presente da Fase 1/2:
- `packages/shared-types`: schemi TypeBox `Interval`, `TipoSpesa`, `Andamento`/`AndamentoInput`, `Utente`/`LoginInput`/`UpdateMeInput`, `Statistica`/`Statistiche`.
- Route Elysia con validazione di `body` e `params` dagli schemi condivisi; nessun `response` schema.
- `buildApp()` (`apps/api/src/app.ts`) compone i plugin di risorsa; **non** esporta il tipo dell'app.
- `apps/api/package.json`: `name: "@gc/api"`, **nessun** `exports`/`main`. Elysia risolto a **1.4.29** (peer di `@elysiajs/jwt@1.4.2` richiede `elysia >= 1.4.27`).

Bugia di tipo latente ereditata: `Statistica.value` e `Andamento.costo` dichiarati `number` ma emessi come stringa a runtime. Il vecchio frontend Angular ci si appoggiava via coercizione implicita (`item.value / n`).

---

## 3. A — Export `type App`

- In `apps/api/src/app.ts`: `export type App = ReturnType<typeof buildApp>;`.
- In `apps/api/package.json` aggiungere:
  ```json
  "exports": { ".": "./src/app.ts" }
  ```
  così `import type { App } from '@gc/api'` risolve come import **solo-tipo** (cancellato in compilazione → nessuna dipendenza runtime web→api, nessun problema di bundling; l'`exports` può puntare al sorgente `.ts`).

---

## 4. B — Response schemas + coercizione numerica

### 4.1 shared-types — DTO di risposta da completare
- `AndamentoSchema` (`costo: Type.Number({ minimum: 0.01 })`) — risposta di `GET /andamento`, `GET /andamento/:id`, `POST`, `PUT` *(già esiste, riusare)*.
- `StatisticaSchema` (`value: Type.Number()`) *(già `Number`, riusare per l'array)*.
- `UtenteSchema` — risposta di `GET /utente/me` e register `POST /utente` *(già esiste)*.
- `LoginResponseSchema = Type.Object({ utente: UtenteSchema })` — **nuovo**, per login e refresh (che ritornano `{ utente }`).
- `MessageSchema = Type.Object({ message: Type.String() })` — **nuovo**, per logout, logout-all, `DELETE /me`.

### 4.2 Repository — coercizione in uscita
- `andamento.repository`: mappare `costo: Number(row.costo)` in lettura (findAll, findById) e nei ritorni di save/update.
- `statistiche.repository`: mappare `value: Number(row.value)` in **ogni** query (`speseFrequenti` + `statistics`). L'SQL resta VERBATIM; si converte solo il campo in JS dopo `db.execute`.

### 4.3 Route — aggiungere `response:`
Aggiungere lo schema `response` a tutte e 20 le route, riferendo gli schemi condivisi:

| Route | response |
|---|---|
| `GET /andamento` | `t.Array(AndamentoSchema)` |
| `GET /andamento/:id` | `AndamentoSchema` |
| `POST /andamento` | `AndamentoSchema` |
| `PUT /andamento/:id` | `AndamentoSchema` |
| `DELETE /andamento/:id` | `MessageSchema` *(o shape attuale — verificare service)* |
| `GET /tipo-spesa` | `t.Array(TipoSpesaSchema)` |
| `GET /tipo-spesa/:id` | `TipoSpesaSchema` |
| `GET /statistiche/*` (6) | `StatisticheSchema` (`t.Array(StatisticaSchema)`) |
| `POST /utente/login` | `LoginResponseSchema` |
| `POST /utente` (register) | `UtenteSchema` |
| `POST /utente/refresh` | `LoginResponseSchema` |
| `GET /utente/me` | `UtenteSchema` |
| `PATCH /utente/me` | `UtenteSchema` |
| `DELETE /utente/me` | `MessageSchema` |
| `POST /utente/logout` | `MessageSchema` |
| `POST /utente/logout-all` | `MessageSchema` |

*(Le shape esatte di DELETE/logout vanno verificate contro il ritorno reale dei service durante l'implementazione; il response schema deve combaciare o Elysia risponde 422.)*

---

## 5. C — Aggancio Eden + test di contratto

- Installare `@elysiajs/eden` a versione **allineata a Elysia 1.4.x** (version skew Eden/Elysia = rischio noto → pin coerente).
- **Test di contratto** (`bun test`, in `apps/api`):
  - `const api = treaty(buildApp())` — istanza Elysia passata **direttamente** (in-memory, nessuna porta aperta).
  - Autenticazione via cookie (riuso helper dei test auth di Fase 2).
  - Chiamate a route rappresentative: `api.andamento.get()`, una `statistiche`, `api.utente.me.get()` → asserzione della **shape** (con `costo`/`value` come `number`) e verifica che i **tipi** risolvano.
- File type-only (compile-only, verificato da `tsc --noEmit`) che dimostra `treaty<App>()` con metodo/path/body/response inferiti — de-risking per Fase 4.

### Data flow
`shared-types` (TypeBox) → Elysia valida input **e** output → `type App` inferito → `treaty<App>` → *(Fase 4: hook TanStack Query)*.

---

## 6. Testing & rischi

- **Test di caratterizzazione statistiche (Fase 1):** oggi potrebbero asserire stringhe → **aggiornare a `number`** nello stesso task che introduce la coercizione, altrimenti RED. Prima RED→GREEN per provare il cambio di tipo.
- **Response 422:** se una shape non combacia con lo schema dopo la coercizione, il test di contratto lo cattura al seam.
- **Eden/Elysia version skew:** pin coerente `^1.4.x`.
- **Regressione parità valore:** la coercizione `Number(...)` non deve alterare il valore (solo il tipo). Coperto dai test di caratterizzazione aggiornati.

---

## 7. Fuori scope Fase 3 (→ Fase 4)

- Client factory Eden (`createApiClient(baseUrl)`) + hook TanStack Query.
- CSRF header custom + CORS origin esplicito (già backlog Fase 4/6).
- Qualsiasi React/UI/bundler in `apps/web`.
