# Fase 4b — Andamento (lista + modifica) — Design

- **Data:** 2026-07-09
- **Stato:** approvato (design) — pronto per il piano di implementazione. Decisioni confermate dall'utente: input di form **nativi** (`<input type="date">` / `type="number"` / `<select>`, niente datepicker-popup / currency-mask / select-ricercabile); icone via **`react-icons`** (1 dep, glifi FA identici all'originale); difesa **CSRF con header custom obbligatorio** (`X-Requested-With`).
- **Repo target:** `gestione-casa` (branch di lavoro previsto: `feat/phase4b-andamento` off `master` @ 424dc85, dopo il merge di PR #4)
- **Spec padre:** `docs/superpowers/specs/2026-07-01-gc-migration-design.md` §6, §7, §11, §12 · Spec 4a: `docs/superpowers/specs/2026-07-06-phase4a-foundation-design.md`
- **Natura:** migrazione tecnica. Porting che preserva comportamento e look (Bootstrap 5 / tema Minty invariati). Nessun redesign. Unica eccezione volontaria: i tre widget di input "ricchi" dell'originale sono resi con primitive native del browser (deciso).

---

## 0. Contesto: Fase 4 scomposta in 4 sotto-fasi

Fase 4 (frontend React) è scomposta in 4a/4b/4c/4d, ognuna con ciclo spec → piano → subagent-driven → PR. Stato: **4a MERGED** (PR #4, CI verde). Questo doc copre **solo 4b**.

- 4a — Fondazione (merged): scaffold, router, Query, client Eden, auth cookie, tema, layout/spinner/toast, error handling globale.
- **4b — Andamento** (questo doc): schermo `lista` + form `modifica` (CRUD), fetch `tipo-spesa`, e la difesa **CSRF header custom** rimandata da 4a.
- 4c — Statistiche: 5 schermi, Recharts, toggle M/Y/A come search param tipizzati.
- 4d — Profilo + PWA + rifiniture.

---

## 1. Obiettivo di 4b

Portare i due schermi centrali dell'app — **la lista delle voci di spesa e il form di inserimento/modifica** — con piena parità funzionale rispetto all'Angular legacy (`gc-frontend/src/app/andamento/{lista,modifica}`), innestandoli sulla fondazione di 4a. È la prima fase che introduce **mutation** (create/update/delete): con esse arriva la difesa CSRF prevista dalla roadmap.

Deliverable: dopo il login, l'utente vede la lista reale delle voci di spesa (filtro + ordinamento + paginazione), può crearne di nuove (anche dai tre pulsanti rapidi), modificarle, clonarle ed eliminarle — tutto contro l'API reale, con i cookie httpOnly + header CSRF.

**Mappatura di routing (chiave):** nell'app legacy `path: 'home'` renderizza `ListaComponent`. Quindi **la lista Andamento sostituisce lo stub `/home`** creato in 4a (`routes/home.route.tsx`). Nessuna nuova route: `/` → `/home` e il guard `requireAuth` restano invariati. Inserimento/modifica/eliminazione avvengono in **modali** (parità: l'originale usa una modale ngx-bootstrap, non una route dedicata).

---

## 2. Contratto API (già pronto da Fase 1–3)

L'API è completa e tipizzata; 4b è **solo frontend** (eccetto il tocco CSRF lato server, §6). Il client Eden è staticamente tipizzato sulle route reali. Superficie usata:

| Uso | Chiamata Eden | Risposta |
|-----|---------------|----------|
| lista | `apiClient.andamento.get()` | `Andamento[]` |
| crea | `apiClient.andamento.post(body)` | `Andamento` |
| modifica | `apiClient.andamento({ id }).put(body)` | `Andamento` |
| elimina | `apiClient.andamento({ id }).delete()` | `{ deleted: number }` |
| categorie | `apiClient['tipo-spesa'].get()` | `TipoSpesa[]` |

Shape (da `@gc/shared-types`): `Andamento { id?, giorno: string "YYYY-MM-DD", descrizione, costo: number ≥0.01, tipoSpesa: TipoSpesa }`; body input `AndamentoInput { id?, giorno, descrizione, costo, tipoSpesa: { id } }`; `TipoSpesa { id, descrizione }`.

> Nota d'oro: le shape del wire coincidono già con le primitive native scelte — `<input type="date">` emette esattamente `"YYYY-MM-DD"`, `<input type="number">` un `number`. Zero conversioni (niente luxon).

---

## 3. Architettura & struttura file (`apps/web`)

Nuova slice verticale `src/andamento/`, coerente con le convenzioni di 4a (hook Query colocati, componenti React-Bootstrap, form react-hook-form `mode:'onChange'`).

```
apps/web/src/
├── andamento/
│   ├── queries.ts            # hook TanStack Query: useAndamentoList, useTipoSpesaList,
│   │                         #   useSaveAndamento (post|put by id), useDeleteAndamento.
│   │                         #   Invalidano ['andamento']; errori auto-toastati dal
│   │                         #   MutationCache globale (4a) — qui solo toast di successo/parità.
│   ├── AndamentoList.tsx     # schermo lista: toolbar (filtro + 4 quick-add), tabella
│   │                         #   (sort colonne, formattazione €/data), paginazione,
│   │                         #   azioni riga (modifica/clona/elimina), modali.
│   ├── AndamentoForm.tsx     # form dentro <Modal>: giorno/descrizione/costo/tipoSpesa
│   │                         #   (input nativi) + validazione + Salva/Annulla.
│   └── prefills.ts           # i 3 prefill rapidi (Spesa id=1, Carburante id=2, Pulizie id=7)
│                             #   con descrizioni legacy — IDs hardcoded (coupling documentato).
├── routes/
│   └── home.route.tsx        # ORA renderizza <AndamentoList/> (era stub in 4a)
└── (esistenti invariati: api/client.ts [+header CSRF], query/*, auth/*, layout/*, theme/*)
```

**Dipendenze introdotte in 4b:** `react-icons` (glifi FA: `FaPlus, FaShoppingCart, FaCar, FaShower, FaPencilAlt, FaClone, FaTrash, FaChevronUp, FaChevronDown, FaCircleChevronUp, FaCircleChevronDown, FaCalendar, FaTimes`). Già disponibili da 4a: `react-bootstrap` (`Modal`, `Pagination`, `Table` opzionale, `Form`), `react-hook-form`, `sonner`, `@tanstack/react-query`. **Non** portati: `ngx-bootstrap` (datepicker/modal/pagination/tooltip), `ngx-currency`, `@ng-select/ng-select`, `luxon`, `lodash-es` (sostituiti da primitive native / piccoli helper).

---

## 4. Schermo lista — parità (`AndamentoList.tsx`)

Tutta la logica di lista è **client-side**, esattamente come il legacy (il resolver pre-caricava l'intera lista; qui `useAndamentoList()` la carica una volta e derivo filtro→ordinamento→paginazione con `useMemo`). Stato UI locale: testo filtro, chiave+direzione ordinamento, pagina corrente, voce selezionata, flag modali.

- **Toolbar** — input filtro con pulsante clear (×); quattro quick-add:
  - **Nuova** → modale con form vuoto, titolo "Nuova voce di spesa".
  - **Spesa** → prefill `{ descrizione:'Spesa', tipoSpesa:{id:1,'Spesa'} }`, giorno oggi, titolo "Spesa".
  - **Carburante** → prefill `{ descrizione:'Gasolio Fiesta', tipoSpesa:{id:2,'Carburante'} }`, titolo "Carburante".
  - **Pulizie** → prefill `{ descrizione:'Michela pulizie', tipoSpesa:{id:7,'Casa'} }`, titolo "Pulizie casa".
  - Gli ID 1/2/7 sono hardcoded per parità (coupling documentato nel CLAUDE.md di progetto).
- **Tabella** — colonne Giorno (`dd/MM/yyyy`), Descrizione, Costo (`€` via `Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR'})`, allineato a destra), Tipo spesa, Azioni.
- **Ordinamento** (client) — per giorno / descrizione / costo, asc e desc, con icone chevron che mostrano lo stato attivo (chevron pieno sulla direzione selezionata). Confronto lessicografico per stringhe/date `YYYY-MM-DD`, numerico per costo — identico all'helper `compare` originale.
- **Filtro** (client) — match su `descrizione` **o** `tipoSpesa.descrizione` (case-insensitive), applicato **solo se lunghezza > 2** (quirk legacy mantenuto); altrimenti lista intera. Il clear (×) azzera il filtro.
- **Paginazione** (client) — `pageSize = 10`, mostrata **solo se** la lista (filtrata) supera 10 elementi; controllo `react-bootstrap` `Pagination` con first/prev/next/last (`<< < > >>`) e finestra di 5 pagine (parità `maxSize`/`boundaryLinks`).
- **Azioni riga** — **Modifica** (apre modale in edit, id presente); **Clona** (apre modale con stessi campi ma senza id e giorno = oggi); **Elimina** (apre modale di conferma → delete).

Post-mutation: `invalidateQueries(['andamento'])` ricarica la lista; il filtro corrente resta applicato (parità con `applicaFiltro(this.filter)` dopo save/delete).

---

## 5. Form modifica — input nativi (`AndamentoForm.tsx`)

`react-bootstrap` `Modal` che avvolge un form `react-hook-form` (`mode:'onChange'`, come `LoginForm`). Campi:

| Campo | Controllo | Validazione (parità) |
|-------|-----------|----------------------|
| giorno | `<input type="date">` | `required`; default = oggi per nuovo/clona; valore già `YYYY-MM-DD` |
| descrizione | `<input type="text">` | `required` |
| costo | `<input type="number" step="0.01" min="0.01">` | `required`, `min 0.01` (msg "deve essere maggiore di zero") |
| tipoSpesa | `<select>` (opzioni da `useTipoSpesaList()`, value = id) | `required` |

- Messaggi di errore per-campo in italiano identici all'originale ("Il campo … è obbligatorio", ecc.), mostrati con lo stile `is-invalid` di Bootstrap.
- **Salva** disabilitato finché il form è invalido; **Annulla** chiude la modale.
- Submit: costruisce `AndamentoInput { id?, giorno, descrizione, costo:number, tipoSpesa:{ id } }` e invoca `useSaveAndamento` (post o put in base alla presenza di `id`). Toast di successo per-azione (parità: "Nuova voce di spesa inserita correttamente" / "Voce di spesa modificata correttamente"); l'eliminazione mostra un toast warning ("La voce di spesa è stata eliminata correttamente").
- **Conferma eliminazione**: piccola `Modal` inline (titolo "Elimina voce di spesa", pulsanti Elimina/Annulla). *(ponytail: inline ora; estrarre un `ConfirmDialog` riutilizzabile quando 4d/profilo ne avrà un secondo utilizzo.)*

**Semplificazioni volontarie** (rispetto ai widget legacy, deciso con l'utente): niente calendario-popup (bsDatepicker), niente maschera valuta live mentre si digita (ngx-currency), niente dropdown ricercabile (ng-select). Le primitive native coprono il comportamento e combaciano 1:1 col wire.

---

## 6. CSRF — header custom obbligatorio (tocca il backend)

Difesa rimandata da 4a. Costante di **contratto** (non config env, come i path delle route): header `X-Requested-With: gc-web`. La difesa è il **nome** dell'header — una pagina cross-site non può impostare un header non-"safelisted" senza un preflight CORS, che il nostro `CORS_ORIGIN` stretto rifiuta; il valore è arbitrario.

- **api** —
  - `errors.ts`: nuova classe `ForbiddenError` → mappata a **403** in `withErrorHandling` (`.error({ …, ForbiddenError })` + case nello switch).
  - `auth/csrf.plugin.ts`: nuovo plugin Elysia che, per i metodi mutanti (**POST/PUT/DELETE/PATCH**), richiede la presenza dell'header `X-Requested-With` → altrimenti `throw new ForbiddenError(...)` (403). Montato in `buildApp()` **prima** dei gruppi di route. GET/HEAD/OPTIONS esenti (i preflight OPTIONS sono gestiti dal plugin cors a monte).
  - **Verifica CORS obbligatoria:** oggi `cors({ origin: env.CORS_ORIGIN, credentials: true })`. In dev web(3000)→api(5000) è cross-origin, quindi l'header custom scatena un **preflight**; il plugin cors **deve** consentire `X-Requested-With` in `Access-Control-Allow-Headers` (verificare il default di `@elysiajs/cors`; se non riflette la richiesta, impostare `allowedHeaders`/`methods` espliciti). Senza questo, le richieste mutanti legittime in dev si romperebbero.
- **web** — aggiungere `headers: { 'X-Requested-With': 'gc-web' }` alla config del client `treaty<App>(...)` (`api/client.ts`), applicato a tutte le richieste.
- **Ripple sui test esistenti (importante):** i test api attuali (`utente`/`andamento`/`tipo-spesa`) inviano richieste mutanti **senza** l'header → col plugin attivo riceverebbero 403. Aggiornare i loro helper di login/richiesta perché inviino `X-Requested-With`. Aggiungere un test CSRF mirato: richiesta mutante **senza** header ⇒ 403; **con** header ⇒ passa.

---

## 7. Testing (convenzione 4a — component/logic + verifica manuale; E2E → Fase 5)

`bun test` + React Testing Library (happy-dom), web test in processo isolato (`bun run --filter '@gc/web' test`), `afterEach(cleanup)` globale già attivo. Coprire:

- **queries.ts**: `useSaveAndamento` sceglie post vs put in base alla presenza di `id`; delete chiama l'endpoint giusto; invalidazione `['andamento']` on success (client Eden mockato).
- **AndamentoList**: regola filtro > 2 caratteri; toggle ordinamento (asc↔desc, icona attiva); visibilità paginazione (≤10 nascosta, >10 mostrata); i quick-add aprono la modale con titolo/prefill corretti; flusso conferma-elimina.
- **AndamentoForm**: validazione (required per campo + min costo), giorno default = oggi su nuovo, Salva disabilitato quando invalido, shape del payload di submit (`giorno` `YYYY-MM-DD`, `tipoSpesa:{id}`, `costo` number).
- **CSRF**: test api 403 senza header / ok con header; verifica che il client invii l'header.
- **Verifica manuale** (skill `run`/`verify`): api (`CORS_ORIGIN=http://localhost:3000`) + Postgres + web :3000 → CRUD completo end-to-end nel browser.

Gate CI invariati: `bun install --frozen-lockfile`, `prettier --check`, `tsc --noEmit` su tutti i workspace, `bun run test`, `bun build` del web.

---

## 8. Rischi & mitigazioni

- **CSRF che rompe i test/il dev cross-origin.** Mitigazione: verificare esplicitamente il preflight CORS (§6) e aggiornare i test api nello stesso task del plugin; il plugin e l'header client vanno introdotti insieme (commit coeso) per non lasciare la suite rossa a metà.
- **Formattazione data/valuta.** `Intl.NumberFormat('it-IT')`/formato `dd/MM/yyyy` a mano — nessuna dipendenza di locale extra; il browser fornisce già il locale per `<input type="date">`.
- **Parità dei dettagli di lista** (regola filtro >2, quirk ordinamento, soglia paginazione a 10). Mitigazione: test mirati che bloccano ognuno di questi comportamenti.
- **`react-icons` bundle size** — import per-glifo (tree-shakeable), non l'intero set.

---

## 9. Fuori scope 4b (→ 4c/4d/5/6)

- Statistiche + Recharts + toggle periodo (4c).
- Profilo (cambio password) + PWA `manifest.webmanifest`/icone + rifiniture locale finali (4d).
- Suite Playwright E2E completa (Fase 5).
- `CORS_ORIGIN` di prod esplicito + `COOKIE_SECURE=true` + `COOKIE_DOMAIN` (Fase 6 deploy).
- Riproduzione fedele dei widget "ricchi" (datepicker-popup / currency-mask live / select ricercabile) — resi con primitive native per scelta.
- Estrazione di un `ConfirmDialog` riutilizzabile — quando comparirà il secondo consumatore.
