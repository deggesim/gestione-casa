# Fase 3 — Shared types + Eden Treaty — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rendere il contratto API di `apps/api` tipizzato end-to-end e consumabile da Eden Treaty, con `@gc/shared-types` come unica fonte di verità anche per le risposte.

**Architecture:** L'app Elysia esporta `type App`; ogni route dichiara un `response` schema TypeBox condiviso (validazione runtime delle uscite); il repository statistiche coercia i valori numerici da stringa a numero; un test di contratto in-memory (`treaty(buildApp())`) prova il client tipizzato end-to-end. `apps/web` NON viene toccato (il client + hook TanStack Query sono Fase 4).

**Tech Stack:** Bun, Elysia 1.4.29, `@elysiajs/eden` ^1.4.x, `@sinclair/typebox`, Drizzle ORM (bun-sql), `bun test`.

**Design:** `docs/superpowers/specs/2026-07-03-phase3-shared-types-eden-design.md`

## Prerequisiti (una volta, prima di Task 1)

Il checkout locale è ancora su `feat/phase2-auth` e `master` locale è indietro rispetto a `origin/master` (che ha il merge di PR #2). Sincronizzare e creare la branch:

```bash
cd gestione-casa
git switch master && git pull --ff-only
git switch -c feat/phase3-shared-types-eden
```

## Global Constraints

- **Runtime/versioni:** Bun 1.3.14. Elysia pinned a **1.4.29**; `@elysiajs/eden` deve essere **`^1.4.x`** (version skew Eden/Elysia rompe l'inferenza).
- **TS strict** (ereditato da `tsconfig.base.json`). Typecheck deve restare verde: `bun run --filter '*' typecheck`.
- **Stile:** arrow functions ovunque, niente `class` (eccezione: subclassi di `Error` in `errors.ts`, già presenti), named export, import relativi tra file dello stesso package; `@gc/shared-types` / `@gc/api` sono nomi di workspace package (consentiti), non alias di path.
- **SQL statistiche VERBATIM:** non modificare le stringhe SQL né i set di ID hardcoded. La coercizione avviene in JS *dopo* `db.execute`, mai nell'SQL.
- **Prettier:** `prettier --check .` deve restare verde. Formattare i file toccati.
- **Test env (passare a ogni comando di test):**
  `DATABASE_URL=postgres://gctest:gctest@localhost:5432/gc_test JWT_SECRET=test-secret bun test <file>`
  NON puntare i test al DB reale `postgres`.
- **Commit:** per-task commit autorizzati in blocco all'avvio della fase (workflow SDD dell'utente). Confermare l'autorizzazione una volta prima di Task 1, poi procedere senza fermarsi per ogni commit.
- **Parità:** unico cambiamento osservabile deliberato: `costo`/`statistica.value` passano da stringa numerica a numero (valore identico). Nessun'altra modifica di comportamento.

---

## File Structure

- `apps/api/src/app.ts` — aggiunge `export type App`.
- `apps/api/package.json` — aggiunge `exports` + dep `@elysiajs/eden`.
- `apps/api/test/contract-types.ts` — file compile-only che prova l'inferenza di `treaty<App>` (nuovo).
- `packages/shared-types/src/common.ts` — `MessageSchema` (nuovo).
- `packages/shared-types/src/utente.ts` — aggiunge `LoginResponseSchema`.
- `packages/shared-types/src/index.ts` — re-export di `common`.
- `packages/shared-types/src/schemas.test.ts` — validazione dei nuovi schemi (nuovo).
- `apps/api/src/statistiche/statistiche.repository.ts` — coercizione `value` → number.
- `apps/api/test/statistiche.test.ts` — asserzioni aggiornate a number.
- `apps/api/src/andamento/andamento.routes.ts`, `andamento.service.ts` — response schemas + non-null su save/update.
- `apps/api/src/tipo-spesa/tipo-spesa.routes.ts` — response schemas.
- `apps/api/src/statistiche/statistiche.routes.ts` — response schemas.
- `apps/api/src/utente/utente.routes.ts` — response schemas.
- `apps/api/test/contract.test.ts` — test di contratto Eden in-memory (nuovo).

---

## Task 1: Installare Eden ed esportare `type App`

**Files:**
- Modify: `apps/api/package.json` (dependencies + exports)
- Modify: `apps/api/src/app.ts`
- Create: `apps/api/test/contract-types.ts`

**Interfaces:**
- Produces: `type App` (da `@gc/api` e da `apps/api/src/app.ts`); dep `@elysiajs/eden`.

- [ ] **Step 1: Installare `@elysiajs/eden` allineato a Elysia 1.4**

```bash
cd apps/api && bun add @elysiajs/eden@^1.4.0 && cd ../..
```

Verificare in `bun.lock` che la versione risolta sia `1.4.x`.

- [ ] **Step 2: Esportare `type App` da `app.ts`**

In fondo a `apps/api/src/app.ts`, dopo la definizione di `buildApp`:

```ts
export type App = ReturnType<typeof buildApp>;
```

- [ ] **Step 3: Esporre il package via `exports`**

In `apps/api/package.json` aggiungere (accanto a `"type": "module"`):

```json
  "exports": { ".": "./src/app.ts" },
```

- [ ] **Step 4: Scrivere il file di prova compile-only dell'inferenza**

Crea `apps/api/test/contract-types.ts` (estensione `.ts`, NON `.test.ts`: non è un test runtime, serve solo al typecheck):

```ts
// Compile-only proof that Eden Treaty resolves App into typed accessors.
// If `type App` or the package `exports` regress, `tsc --noEmit` fails here.
import { treaty } from '@elysiajs/eden';
import type { App } from '@gc/api';

const api = treaty<App>('http://localhost');

// These calls must type-check: method/path/params are inferred from App.
export const _proofs = {
  listAndamento: () => api.andamento.get(),
  getAndamento: () => api.andamento({ id: 1 }).get(),
  spesa: () => api.statistiche.spesa({ interval: 'M' }).get(),
  me: () => api.utente.me.get(),
  login: () => api.utente.login.post({ email: 'a@b.it', password: 'pw' }),
};
```

- [ ] **Step 5: Verificare che il typecheck fallisca senza l'export, poi passi**

Run: `bun run --filter '@gc/api' typecheck`
Expected: PASS (verde). Per provare che il file è caricante, commentare temporaneamente la riga `export type App` in `app.ts` e rieseguire → deve FALLIRE con "App has no exported member"; ripristinare la riga → PASS.

- [ ] **Step 6: Prettier + commit**

```bash
bunx prettier --write apps/api/src/app.ts apps/api/test/contract-types.ts apps/api/package.json
git add apps/api/package.json apps/api/src/app.ts apps/api/test/contract-types.ts bun.lock
git commit -m "feat(api): export type App + Eden dep, prove treaty inference"
```

---

## Task 2: Schemi di risposta condivisi (`MessageSchema`, `LoginResponseSchema`)

**Files:**
- Create: `packages/shared-types/src/common.ts`
- Modify: `packages/shared-types/src/utente.ts`
- Modify: `packages/shared-types/src/index.ts`
- Test: `packages/shared-types/src/schemas.test.ts`

**Interfaces:**
- Consumes: `UtenteSchema` (da `./utente`).
- Produces: `MessageSchema` / `Message` (da `@gc/shared-types`); `LoginResponseSchema` / `LoginResponse` (da `@gc/shared-types`).

- [ ] **Step 1: Scrivere il test dei nuovi schemi**

Crea `packages/shared-types/src/schemas.test.ts`:

```ts
import { test, expect } from 'bun:test';
import { Value } from '@sinclair/typebox/value';
import { MessageSchema } from './common';
import { LoginResponseSchema } from './utente';

test('MessageSchema accepts { message } and rejects missing message', () => {
  expect(Value.Check(MessageSchema, { message: 'ok' })).toBe(true);
  expect(Value.Check(MessageSchema, {})).toBe(false);
});

test('LoginResponseSchema accepts { utente: { email } }', () => {
  expect(Value.Check(LoginResponseSchema, { utente: { id: 1, email: 'a@b.it' } })).toBe(true);
  expect(Value.Check(LoginResponseSchema, { utente: { email: 'a@b.it' } })).toBe(true); // id optional
  expect(Value.Check(LoginResponseSchema, { utente: {} })).toBe(false); // email required
});
```

- [ ] **Step 2: Eseguire il test → deve fallire**

Run: `cd packages/shared-types && bun test src/schemas.test.ts`
Expected: FAIL con "Cannot find module './common'" / "MessageSchema is not exported".

- [ ] **Step 3: Creare `common.ts`**

```ts
import { type Static, Type } from '@sinclair/typebox';

export const MessageSchema = Type.Object({ message: Type.String() });
export type Message = Static<typeof MessageSchema>;
```

- [ ] **Step 4: Aggiungere `LoginResponseSchema` a `utente.ts`**

In fondo a `packages/shared-types/src/utente.ts`:

```ts
export const LoginResponseSchema = Type.Object({ utente: UtenteSchema });
export type LoginResponse = Static<typeof LoginResponseSchema>;
```

- [ ] **Step 5: Re-export in `index.ts`**

Aggiungere in `packages/shared-types/src/index.ts`:

```ts
export * from './common';
```

- [ ] **Step 6: Eseguire il test → deve passare**

Run: `cd packages/shared-types && bun test src/schemas.test.ts`
Expected: PASS (2 test).

- [ ] **Step 7: Prettier + commit**

```bash
bunx prettier --write packages/shared-types/src/common.ts packages/shared-types/src/utente.ts packages/shared-types/src/index.ts packages/shared-types/src/schemas.test.ts
git add packages/shared-types/src
git commit -m "feat(shared-types): add MessageSchema + LoginResponseSchema"
```

---

## Task 3: Coercizione numerica delle statistiche

**Files:**
- Modify: `apps/api/src/statistiche/statistiche.repository.ts`
- Test: `apps/api/test/statistiche.test.ts`

**Interfaces:**
- Produces: `createStatisticheRepository(db).speseFrequenti(i)` e `.statistics(i, tipoSpesa?)` ora ritornano `Statistica[]` con `value: number` a runtime (prima: stringa).

- [ ] **Step 1: Aggiornare i test per asserire `number` (non più `Number(r.value)`)**

In `apps/api/test/statistiche.test.ts` sostituire le asserzioni che avvolgono `Number(...)` con asserzioni dirette sul numero:

```ts
test('speseFrequenti (A) sums by category, ordered by value DESC', async () => {
  const rows = await repo.speseFrequenti(Interval.tutto);
  expect(rows).toEqual([
    { name: 'spesa', value: 180 },
    { name: 'carburante', value: 50 },
    { name: 'bolletta', value: 40 },
  ]);
});

test('statistics monthly for spesa (id 1) fills gaps with 0 and formats YYYYMM DESC', async () => {
  const rows = await repo.statistics(Interval.mese, 1);
  const map = Object.fromEntries(rows.map((r) => [r.name, r.value]));
  expect(map['202501']).toBe(100);
  expect(map['202502']).toBe(80);
  expect(rows[0]!.name >= rows[rows.length - 1]!.name).toBe(true);
});

test('statistics yearly for all default categories aggregates to 2025', async () => {
  const rows = await repo.statistics(Interval.anno);
  const y2025 = rows.find((r) => r.name === '2025');
  expect(y2025).toBeDefined();
  expect(y2025!.value).toBe(220);
  expect(typeof y2025!.value).toBe('number');
});
```

- [ ] **Step 2: Eseguire i test → devono fallire (value è stringa)**

Run: `DATABASE_URL=postgres://gctest:gctest@localhost:5432/gc_test JWT_SECRET=test-secret bun test apps/api/test/statistiche.test.ts`
Expected: FAIL — `expect(rows).toEqual([{value:180}...])` riceve `value: "180"` (stringa); `typeof` è `"string"`.

- [ ] **Step 3: Coercire `value` nel repository**

In `apps/api/src/statistiche/statistiche.repository.ts`: cambiare il tipo generico di `db.execute` in `{ name: string; value: string }` e mappare a number nei ritorni. Sostituire ognuno dei tre `return [...result] as Statistica[];` con la coercizione. Esempio per `speseFrequenti`:

```ts
const result = await db.execute<{ name: string; value: string }>(sql`
  SELECT ts.descrizione AS name, SUM(a.costo) AS value
  FROM gc.andamento a JOIN gc.tipo_spesa ts ON a.tipo_spesa_id = ts.id
  ${whereCondition}
  GROUP BY ts.id, ts.descrizione
  ORDER BY value DESC
`);
return [...result].map((r) => ({ name: r.name, value: Number(r.value) }));
```

Applicare identica trasformazione ai due `db.execute` dentro `statistics` (ramo `mese` e ramo `anno`): tipo generico `{ name: string; value: string }`, e `return [...result].map((r) => ({ name: r.name, value: Number(r.value) }));`. **Non toccare le stringhe SQL.**

- [ ] **Step 4: Eseguire i test → devono passare**

Run: `DATABASE_URL=postgres://gctest:gctest@localhost:5432/gc_test JWT_SECRET=test-secret bun test apps/api/test/statistiche.test.ts`
Expected: PASS (3 test).

- [ ] **Step 5: Typecheck + prettier + commit**

```bash
bun run --filter '@gc/api' typecheck
bunx prettier --write apps/api/src/statistiche/statistiche.repository.ts apps/api/test/statistiche.test.ts
git add apps/api/src/statistiche/statistiche.repository.ts apps/api/test/statistiche.test.ts
git commit -m "feat(api): coerce statistiche value to number (honest DTO)"
```

---

## Task 4: Response schema su tutte le route

**Files:**
- Modify: `apps/api/src/andamento/andamento.routes.ts`
- Modify: `apps/api/src/andamento/andamento.service.ts` (non-null su save/update)
- Modify: `apps/api/src/tipo-spesa/tipo-spesa.routes.ts`
- Modify: `apps/api/src/statistiche/statistiche.routes.ts`
- Modify: `apps/api/src/utente/utente.routes.ts`
- Test: `apps/api/test/andamento.test.ts` (aggiunta asserzione tipo `costo`)

**Interfaces:**
- Consumes: `AndamentoSchema`, `TipoSpesaSchema`, `StatisticheSchema`, `UtenteSchema`, `LoginResponseSchema`, `MessageSchema` (da `@gc/shared-types`).
- Produces: risposte validate a runtime; tipi di ritorno inferibili da Eden.

- [ ] **Step 1: Rendere non-null i ritorni di save/update nel service andamento**

Il response schema `AndamentoSchema` non ammette `null`; `save`/`update` oggi ritornano `Andamento | null`. In `apps/api/src/andamento/andamento.service.ts` cambiare i due ritorni finali (riga con `return repo.findById(id);` in `save` e `return repo.findById(input.id);` in `update`):

```ts
  save: async (input: AndamentoInput) => {
    if (!(await repo.tipoSpesaExists(input.tipoSpesa.id)))
      throw new BadRequestError(`TipoSpesa ${input.tipoSpesa.id} not found`);
    const id = await repo.insert(input);
    return (await repo.findById(id))!; // just inserted → guaranteed present
  },
  update: async (input: AndamentoInput) => {
    if (input.id == null || !(await repo.findById(input.id)))
      throw new BadRequestError(`Andamento ${input.id} not found`);
    if (!(await repo.tipoSpesaExists(input.tipoSpesa.id)))
      throw new BadRequestError(`TipoSpesa ${input.tipoSpesa.id} not found`);
    await repo.update(input);
    return (await repo.findById(input.id))!; // just updated → guaranteed present
  },
```

- [ ] **Step 2: Aggiungere response schema alle route andamento**

`apps/api/src/andamento/andamento.routes.ts` — aggiornare import e ogni route:

```ts
import { Elysia, t } from 'elysia';
import { AndamentoInputSchema, AndamentoSchema } from '@gc/shared-types';
// ...
export const andamentoRoutes = new Elysia({ prefix: '/andamento' })
  .use(authPlugin)
  .get('/', () => service.findAll(), { response: t.Array(AndamentoSchema) })
  .get('/:id', ({ params }) => service.findById(params.id), {
    params: t.Object({ id: t.Number() }),
    response: AndamentoSchema,
  })
  .post('/', ({ body }) => service.save(body), {
    body: AndamentoInputSchema,
    response: AndamentoSchema,
  })
  .put('/:id', ({ body }) => service.update(body), {
    params: t.Object({ id: t.Number() }),
    body: AndamentoInputSchema,
    response: AndamentoSchema,
  })
  .delete('/:id', ({ params }) => service.remove(params.id), {
    params: t.Object({ id: t.Number() }),
    response: t.Object({ deleted: t.Number() }),
  });
```

- [ ] **Step 3: Aggiungere response schema alle route tipo-spesa**

`apps/api/src/tipo-spesa/tipo-spesa.routes.ts` — importare `TipoSpesaSchema` da `@gc/shared-types` e aggiungere:
- `GET /` → `{ response: t.Array(TipoSpesaSchema) }`
- `GET /:id` → oltre a `params: t.Object({ id: t.Number() })`, aggiungere `response: TipoSpesaSchema`.

(Preservare la struttura esistente delle route; aggiungere solo la chiave `response` all'oggetto opzioni, importando `t` da `elysia` e `TipoSpesaSchema` da `@gc/shared-types` se non già importati.)

- [ ] **Step 4: Aggiungere response schema alle route statistiche**

`apps/api/src/statistiche/statistiche.routes.ts` — importare `StatisticheSchema` da `@gc/shared-types` e aggiungere `response: StatisticheSchema` all'oggetto opzioni di tutte e 6 le route. Estendere l'oggetto `params` condiviso:

```ts
import { IntervalSchema, StatisticheSchema, type Interval } from '@gc/shared-types';
// ...
const opts = { params: t.Object({ interval: IntervalSchema }), response: StatisticheSchema };
```

e passare `opts` (al posto dell'attuale `params`) come terzo argomento di ogni `.get(...)`.

- [ ] **Step 5: Aggiungere response schema alle route utente**

`apps/api/src/utente/utente.routes.ts` — importare gli schemi e aggiungere `response`:

```ts
import { LoginInputSchema, UpdateMeInputSchema, UtenteSchema, LoginResponseSchema, MessageSchema } from '@gc/shared-types';
```

- `/login` → aggiungere `response: LoginResponseSchema` all'oggetto opzioni (che ha già `body`).
- `/` (register) → l'handler fa `set.status = 201`, quindi usare response per-status: `{ body: LoginInputSchema, response: { 201: UtenteSchema } }`.
- `/refresh` → aggiungere terzo argomento `{ response: LoginResponseSchema }`.
- `/me` GET → aggiungere `{ response: UtenteSchema }`.
- `/me` PATCH → aggiungere `response: UtenteSchema` all'oggetto opzioni (che ha già `body`).
- `/me` DELETE → `{ response: MessageSchema }`.
- `/logout` → `{ response: MessageSchema }`.
- `/logout-all` → `{ response: MessageSchema }`.

- [ ] **Step 6: Aggiungere un'asserzione di tipo su `costo` nel test andamento**

In `apps/api/test/andamento.test.ts`, nel test che legge la lista (o il GET by id), aggiungere una asserzione che `costo` è un numero sul filo HTTP. Individuare un test che fa `await res.json()` su un andamento e aggiungere:

```ts
expect(typeof body[0].costo).toBe('number');
```

(adattare `body[0]` alla forma effettiva della risposta nel test esistente: lista → `body[0].costo`, singolo → `body.costo`.)

- [ ] **Step 7: Eseguire l'INTERA suite → tutto verde (nessun 422)**

Run: `DATABASE_URL=postgres://gctest:gctest@localhost:5432/gc_test JWT_SECRET=test-secret bun test`
Expected: PASS su tutti i file. Se una route restituisce 422, la shape reale non combacia col response schema → confrontare il ritorno del service con lo schema e riconciliare (lo schema deve riflettere l'output reale, senza cambiare comportamento).

- [ ] **Step 8: Typecheck + prettier + commit**

```bash
bun run --filter '*' typecheck
bunx prettier --write apps/api/src
git add apps/api/src apps/api/test/andamento.test.ts
git commit -m "feat(api): response schemas on all routes (shared-types single source of truth)"
```

---

## Task 5: Test di contratto Eden in-memory (capstone)

**Files:**
- Create: `apps/api/test/contract.test.ts`

**Interfaces:**
- Consumes: `buildApp` (da `../src/app`), `treaty` (da `@elysiajs/eden`), helper di reset (`./setup`).

- [ ] **Step 1: Scrivere il test di contratto end-to-end**

Crea `apps/api/test/contract.test.ts`. Usa `treaty` sull'istanza Elysia (in-memory, nessuna porta). Autentica via cookie catturato dalla risposta di login.

```ts
import { test, expect, beforeEach } from 'bun:test';
import { treaty } from '@elysiajs/eden';
import { buildApp } from '../src/app';
import { resetDb, seedFixtures } from './setup';

beforeEach(async () => {
  await resetDb();
  await seedFixtures();
});

// Cookie header string from a treaty response's Set-Cookie list.
const cookieOf = (res: { headers: Headers }) =>
  res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');

test('Eden treaty resolves the typed API contract end-to-end', async () => {
  const api = treaty(buildApp());

  // register + login (public)
  await api.utente.post({ email: 'a@b.it', password: 'pw' });
  const login = await api.utente.login.post({ email: 'a@b.it', password: 'pw' });
  expect(login.status).toBe(200);
  expect(login.data?.utente.email).toBe('a@b.it');
  const cookie = cookieOf(login.response);

  // guarded: GET /andamento — costo is a number over the typed client
  const list = await api.andamento.get({ headers: { cookie } });
  expect(list.status).toBe(200);
  expect(Array.isArray(list.data)).toBe(true);
  if (list.data && list.data.length) expect(typeof list.data[0]!.costo).toBe('number');

  // guarded: GET /statistiche/spesa/:interval — value is a number
  const spesa = await api.statistiche.spesa({ interval: 'M' }).get({ headers: { cookie } });
  expect(spesa.status).toBe(200);
  if (spesa.data && spesa.data.length) expect(typeof spesa.data[0]!.value).toBe('number');

  // guarded: GET /utente/me
  const me = await api.utente.me.get({ headers: { cookie } });
  expect(me.status).toBe(200);
  expect(me.data?.email).toBe('a@b.it');

  // unauthenticated call is rejected
  const denied = await api.utente.me.get();
  expect(denied.status).toBe(401);
});
```

- [ ] **Step 2: Eseguire il test di contratto**

Run: `DATABASE_URL=postgres://gctest:gctest@localhost:5432/gc_test JWT_SECRET=test-secret bun test apps/api/test/contract.test.ts`
Expected: PASS. Se le firme di chiamata Eden (es. `.get({ headers })`, accesso `api.andamento({ id })`) divergono dalla versione installata, correggerle secondo l'errore del compilatore/runtime — la forma path→metodo è: `GET /andamento` → `api.andamento.get`, `GET /andamento/:id` → `api.andamento({ id }).get`, `GET /statistiche/spesa/:interval` → `api.statistiche.spesa({ interval }).get`, `POST /utente/login` → `api.utente.login.post`.

- [ ] **Step 3: Suite completa + typecheck finali**

Run: `DATABASE_URL=postgres://gctest:gctest@localhost:5432/gc_test JWT_SECRET=test-secret bun test`
Expected: PASS su tutti i file.
Run: `bun run --filter '*' typecheck && bunx prettier --check .`
Expected: entrambi verdi.

- [ ] **Step 4: Commit**

```bash
git add apps/api/test/contract.test.ts
git commit -m "test(api): Eden treaty contract test (in-memory, end-to-end typed)"
```

---

## Self-Review (già eseguita in fase di scrittura)

- **Spec coverage:** A (`type App` + exports) → Task 1; B response schemas → Task 4, coercizione → Task 3, nuovi DTO → Task 2; C Eden → Task 1 (dep + inferenza compile-time) + Task 5 (runtime). `apps/web` intatto ✓. Statistiche VERBATIM (coercizione solo in JS) ✓.
- **Type consistency:** `MessageSchema`/`LoginResponseSchema` definiti in Task 2 e usati in Task 4; `type App` definito in Task 1 e usato nel file compile-only e (Fase 4) da web; ritorni non-null di save/update in Task 4 allineati ad `AndamentoSchema`.
- **Rischi noti:** firme di chiamata Eden version-specific (Task 5 Step 2 dà la mappa path→metodo); response 422 su shape non combacianti (Task 4 Step 7 dà la procedura di riconciliazione).

## Note di chiusura fase (dopo Task 5)

Whole-branch review sul modello più forte, poi push + apri PR verso `master` (CI GitHub Actions gira sulla PR). Aggiornare il ledger `.superpowers/sdd/progress.md` e la memoria `gc-migration-status`.
