# Fase 4c — Statistiche — Design

- **Data:** 2026-08-07
- **Stato:** approvato (design) — pronto per il piano di implementazione. Decisioni confermate dall'utente: grafici con **Recharts**; **tutte e 6 le route** statistiche + voce di menù nella navbar; stato dell'intervallo M/Y/A in **`useState` locale** (parità legacy), **non** in search param.
- **Repo target:** `gestione-casa`, branch `feat/phase4c-statistiche` off `master` @ `fc678de` (dopo il merge di PR #5).
- **Spec padre:** `docs/superpowers/specs/2026-07-01-gc-migration-design.md` §6, §10 · Spec 4a: `…/2026-07-06-phase4a-foundation-design.md` · Spec 4b: `…/2026-07-09-phase4b-andamento-design.md`
- **Natura:** migrazione tecnica. Porting che preserva comportamento e look (Bootstrap 5 / tema Minty invariati). Nessun redesign. Unica sostituzione volontaria: la libreria grafici Angular-only `@swimlane/ngx-charts` → **Recharts**, e il rilevamento dispositivo `ngx-device-detector` → `matchMedia`.

---

## 0. Contesto: Fase 4 scomposta in 4 sotto-fasi

Fase 4 (frontend React) è scomposta in 4a/4b/4c/4d, ognuna con ciclo spec → piano → subagent-driven → PR.

- 4a — Fondazione: **MERGED** (PR #4).
- 4b — Andamento (lista + modifica + CSRF): **MERGED** (PR #5, merge commit `fc678de`).
- **4c — Statistiche** (questo doc): 6 route, grafici Recharts, dropdown Statistiche in navbar.
- 4d — Profilo + PWA + rifiniture (+ breadcrumb, vedi §9).

> **Correzione rispetto alla spec 4b §0**, che anticipava per 4c «5 schermi, toggle M/Y/A come search param tipizzati». Entrambi i dettagli sono cambiati in fase di brainstorming: le route sono **6** (la pagina padre "Spese medie" è uno schermo a sé) e l'intervallo resta stato **locale** di componente (§5).

---

## 1. Obiettivo di 4c

Portare l'intera sezione **Statistiche** dell'app legacy (`gc-frontend/src/app/statistiche/`) con piena parità funzionale e visiva, innestandola su fondazione 4a e sullo slice `andamento` di 4b.

Deliverable: dall'header l'utente apre un dropdown "Statistiche" con 6 voci e raggiunge le sei pagine, tutte alimentate dall'API reale, tutte protette dal guard di autenticazione.

**4c è frontend-only.** Il backend è già completo dalla Fase 1: `apps/api/src/statistiche/statistiche.routes.ts` espone tutte e sei le rotte con `IntervalSchema` sui params e `StatisticheSchema` sulla response. Nessuna modifica ad `apps/api` né a `packages/shared-types`.

---

## 2. Superficie legacy da portare

Sei route (`gc-frontend/src/app/app.routes.ts`), tutte sotto `canActivate: [AuthGuard]`:

| Route legacy | Componente | Contenuto | Dati |
|---|---|---|---|
| `/statistiche` | `StatisticheComponent` | 4 tabelle *media mensile* affiancate (bolletta, spesa, carburante, casa), 2 per riga (`col-md-6`) | 4 resolver, tutti con `period: 'Y'` |
| `/statistiche/spese-frequenti` | `SpeseFrequentiComponent` | **torta** per tipo di spesa (radio M/Y/**A**) + tabella "Media mensile spese comuni" | `spese-frequenti/{M\|Y\|A}` (reattivo) + `tutto/Y` (statico) |
| `/statistiche/spesa` | `SpesaComponent` | **barre orizzontali** (radio M/Y) | `spesa/{M\|Y}` |
| `/statistiche/carburante` | `CarburanteComponent` | idem | `carburante/{M\|Y}` |
| `/statistiche/bolletta` | `BollettaComponent` | idem | `bolletta/{M\|Y}` |
| `/statistiche/casa` | `CasaComponent` | idem | `casa/{M\|Y}` |

I quattro componenti a barre sono **lo stesso codice** modulo il metodo di servizio e le etichette (verificato via `diff`: le uniche differenze sono di formattazione e un helper estratto in `carburante`). In React diventano **un solo componente parametrico**.

### Contratto API usato

Tutte le risposte sono `Statistica[]` = `{ name: string; value: number }[]`.

| Uso | Chiamata Eden | Note sul `name` |
|---|---|---|
| barre, interval `M` | `apiClient.statistiche[kind]({ interval: 'M' }).get()` | `"YYYYMM"`, max 48 righe, ordine decrescente |
| barre, interval `Y` | `apiClient.statistiche[kind]({ interval: 'Y' }).get()` | `"YYYY"`, ordine decrescente |
| torta | `apiClient.statistiche['spese-frequenti']({ interval }).get()` | descrizione del tipo di spesa, ordine per valore desc |
| media comuni | `apiClient.statistiche.tutto({ interval: 'Y' }).get()` | `"YYYY"` |

`kind` ∈ `'spesa' | 'carburante' | 'bolletta' | 'casa'`.

**Quirk backend da preservare, non da "aggiustare":** `statistiche.repository.ts::statistics()` ritorna `[]` per `Interval.tutto` (`return []; // Interval.tutto: original falls through to empty (preserved behavior)`). Perciò `A` è significativo **solo** su `spese-frequenti`, che usa l'altra query (`speseFrequenti`). I quattro schermi a barre e la tabella "spese comuni" espongono/usano solo `M`/`Y`, esattamente come oggi.

---

## 3. Struttura dei file

Nuovo slice `apps/web/src/statistiche/`, con la stessa forma di `andamento/` (hook Query separati dai puri, componenti piccoli e a responsabilità singola):

| File | Responsabilità |
|---|---|
| `queries.ts` | `useStatistica(kind, interval)`, `useSpeseFrequenti(interval)`, `useTutto()`. Chiave `['statistiche', <endpoint>, <interval>]` |
| `stats-utils.ts` | Funzioni pure e costanti: `mediaMensile`, `formatMese`, `formatEuroInt`, `SOLAR`, `NATURAL`, `solarColor` |
| `useMediaQuery.ts` | Hook `matchMedia` (6 righe) — sostituisce `ngx-device-detector` |
| `IntervalRadio.tsx` | `<fieldset class="fieldset">` + `<legend class="legend">` + radio inline; opzioni parametriche (M/Y oppure M/Y/A) |
| `MediaTable.tsx` | Tabella Anno/Spesa — usata 5 volte |
| `BarreStatistica.tsx` | Un componente → le 4 route a barre (props `kind`, `yAxisLabel`) |
| `SpeseFrequenti.tsx` | Torta + `MediaTable` |
| `SpeseMedie.tsx` | 4× `MediaTable` (la pagina padre) |

File modificati:

- `apps/web/src/routes/router.tsx` — 6 route nuove, **piatte** (non annidate), tutte con `beforeLoad: requireAuth(queryClient)`.
- `apps/web/src/layout/Layout.tsx` — dropdown "Statistiche" con le 6 voci (+ divisore dopo la prima, come nel legacy).
- `apps/web/src/styles.css` — porting di `.fieldset`, `.legend`, `.barre-orizzontali-mensile`, `.barre-orizzontali-annuale`, `.torta` da `gc-frontend/src/styles.scss`.
- `apps/web/package.json` + `bun.lock` — `recharts` e il suo peer `react-is`.

### Perché route piatte e non annidate

Nel legacy `/statistiche` è una route con figli, e il parent nasconde le proprie tabelle quando un figlio è attivo (`showMainPage`, calcolato su `NavigationEnd` + `route.children.length`). Il layout annidato non condivide quindi nulla fra parent e figli: è puro artificio per ottenere URL gerarchici. Sei route sorelle con gli stessi path danno lo stesso risultato senza `<Outlet>` intermedi e senza logica `showMainPage`.

---

## 4. Trasformazioni dati (il cuore della parità)

Tre funzioni pure in `stats-utils.ts`. Sono l'unico punto in cui il porting può divergere dal legacy, quindi sono le più testate.

### `mediaMensile(rows: Statistica[]): Statistica[]`

Replica identica del blocco ripetuto 4 volte in `statistiche.component.ts` e 1 volta in `spese-frequenti.component.ts`:

```
filtra    +name > annoCorrente - 10
divisore  (+name === annoCorrente) ? meseCorrente0 + 1 : 12     // meseCorrente0 = getMonth(), 0-based
valore    value / divisore
```

Preserva l'ordine di input. `annoCorrente`/`meseCorrente0` vanno **iniettabili** (parametro opzionale con default `new Date()`) per rendere i test deterministici.

### `formatMese(name: string): string`

`"202607"` → `"luglio 2026"`. Il legacy usa Luxon (`DateTime.fromFormat(name,'yyyyMM').setLocale('it-IT').toFormat('MMMM yyyy')`); qui si usa `Intl.DateTimeFormat('it-IT', { month: 'long', year: 'numeric' })` su `new Date(anno, mese-1, 1)` — stesso output, **nessuna dipendenza nuova**. Applicata solo con interval `M`.

### `solarColor(value, min, max): string`

Parità con `schemeType: Linear` di ngx-charts: normalizza il valore sul dominio e sceglie uno dei 10 stop della palette `solar`. Con `max === min` ritorna l'ultimo stop.

### Formattazione valuta

`formatCosto` (it-IT, EUR, 2 decimali) **si riusa** da `../andamento/list-utils` invece di essere riscritta: è già testata e la formattazione deve restare identica in tutta l'app. In `stats-utils` si aggiunge solo `formatEuroInt` (0 decimali, per i tick dell'asse X — parità con `xAxisTickFormatting` del legacy).

> Deviazione accettata: import cross-slice `statistiche → andamento`. L'alternativa (promuovere `formatCosto` in `src/format.ts`) tocca 3 file per zero beneficio funzionale; se in 4d nascerà un terzo consumatore si valuterà la promozione.

---

## 5. Stato dell'intervallo

`useState<Interval>('M')` locale al componente, esattamente come il `FormGroup` del legacy: si resetta cambiando pagina, non finisce nell'URL. Il valore alimenta la query key, quindi il cambio radio produce un refetch (e un cache hit al ritorno sul valore precedente).

Scartato: search param tipizzati con `validateSearch` di TanStack Router. Darebbero URL condivisibili e back/forward, ma non è comportamento del legacy e costa validazione + navigazione per ognuna delle 5 route con radio.

`IntervalRadio` riceve `options` come array di `{ value, label }`, così le etichette restano quelle originali, che **differiscono fra schermi**:

| Schermo | Legenda fieldset | Etichette |
|---|---|---|
| barre (×4) | `Frequenza` | Mensile (M) · Annuale (Y) |
| spese-frequenti | `Range` | Ultimo mese (M) · Ultimo anno (Y) · Tutto (A) |

---

## 6. Grafici (Recharts 3.x)

`recharts@^3` supporta React 19 (`peerDependencies.react: ^19.0.0`). Si aggiunge esplicitamente anche il peer `react-is` per non dipendere dalla risoluzione automatica dei peer di Bun.

### Barre orizzontali — `BarreStatistica.tsx`

```
<div className={interval === 'M' ? 'barre-orizzontali-mensile' : 'barre-orizzontali-annuale'}>
  <ResponsiveContainer>
    <BarChart layout="vertical" data={rows}>
      <XAxis type="number" tickFormatter={formatEuroInt} label="Importo" />
      <YAxis type="category" dataKey="name" label="Mese" />
      <Tooltip formatter={formatCosto} />
      <Bar dataKey="value">{rows.map(r => <Cell fill={solarColor(r.value, min, max)} />)}</Bar>
    </BarChart>
  </ResponsiveContainer>
</div>
```

Con `M` i dati sono fino a 48 mesi: la classe `.barre-orizzontali-mensile` dà al contenitore `calc((100vh - 210px) * 3)`, cioè 3 schermate di scroll — è il comportamento attuale, non un bug da correggere. Le etichette `name` sono passate già formattate da `formatMese` (solo per `M`).

### Torta — `SpeseFrequenti.tsx`

`PieChart` > `Pie` con palette `NATURAL` (i 10 colori dello schema `natural` di ngx-charts), `Legend` con titolo "Legenda", tooltip `<b>nome</b>: <importo>`.

**Sostituzione di `ngx-device-detector`:** il legacy calcola `showLabels = isDesktop()` e `showLegend = isDesktop() || isTablet()`. Si replica con `useMediaQuery`: etichette a `≥992px` (lg, "desktop"), legenda a `≥768px` (md, "tablet"). Le soglie sono i breakpoint Bootstrap, coerenti col resto del layout.

---

## 7. Navigazione

`Layout.tsx` guadagna un dropdown "Statistiche" allineato a sinistra, visibile **solo da autenticati** (`me.data`), con le 6 voci nell'ordine legacy: *Spese medie* — divisore — *Spese frequenti*, *Spesa*, *Carburante*, *Bollette*, *Casa*.

Realizzato con **markup Bootstrap a mano + `useState`** per l'apertura (`className={'dropdown-menu' + (open ? ' show' : '')}`), non con `NavDropdown` di `react-bootstrap`. Due motivi: la navbar attuale è già markup Bootstrap scritto a mano (coerenza), e `NavDropdown` monta Popper per il posizionamento, che sotto happy-dom rende il test del menù fragile. Costo: ~15 righe.

L'header attuale ha solo brand + tema + logout; il dropdown è **indispensabile** perché senza di esso le sei pagine sono irraggiungibili dall'interfaccia.

---

## 8. Testing

Stack invariato: `bun test` + Testing Library + happy-dom, `cd apps/web && bun test --preload ./happydom.ts`.

### Vincolo che governa i test dei grafici

**Recharts sotto happy-dom non disegna nulla**: `ResponsiveContainer` misura il DOM e in happy-dom width/height valgono 0, quindi l'SVG resta vuoto (avviso `The width(0) and height(0) of chart should be greater than 0`). Conseguenza: **nessun test asserisce sui contenuti del grafico**. Si testa tutto ciò che sta *intorno* al grafico (radio, titoli, tabelle) e, in modo esaustivo, le funzioni pure che producono i dati del grafico.

**Divieto esplicito: nessun `mock.module('recharts')`.** In questo repo `mock.module` è process-global e `mock.restore()` non lo annulla (Bun 1.3.14): un mock parziale ha rotto la CI in 4a (`useAuth`, leak → `LoginForm.test`) e di nuovo in 4b (`sonner`, leak → `Layout.test`). Mockare una libreria della superficie di Recharts sarebbe la terza recidiva. I test dei componenti usano invece il pattern leak-free già consolidato in 4b/T4: **`QueryClient` con cache pre-popolata** (`setQueryData` + `staleTime: Infinity`), zero rete e zero mock di moduli.

### Copertura prevista

| File di test | Cosa verifica |
|---|---|
| `stats-utils.test.ts` | `mediaMensile`: divisore 12 vs mese corrente+1, taglio a 10 anni, gennaio (`getMonth()===0` → divisore 1), lista vuota · `formatMese` su più mesi · `formatEuroInt` · `solarColor` agli estremi e con `max===min` |
| `IntervalRadio.test.tsx` | Render delle opzioni, selezione iniziale, `onChange` al click |
| `SpeseMedie.test.tsx` | Cache pre-popolata con 4 serie → 4 tabelle, intestazioni, valori medi formattati |
| `SpeseFrequenti.test.tsx` | Cache pre-popolata → radio a 3 opzioni + tabella "media mensile spese comuni" |
| `BarreStatistica.test.tsx` | Cache pre-popolata → radio a 2 opzioni, cambio M→Y, nessun crash con il grafico a 0×0 |
| `Layout.test.tsx` (esteso) | Il dropdown compare da autenticati e contiene le 6 voci; assente da non autenticati |

### Sicurezza del database nei test

I test di 4c sono **solo web**. Si esegue esclusivamente `cd apps/web && bun test --preload ./happydom.ts`, **mai** `bun run test` dalla root: quest'ultimo eredita `DATABASE_URL` da `apps/api/.env` e `apps/api/test/setup.ts` fa `TRUNCATE` dello schema `gc` — è l'incidente che ha azzerato il DB di sviluppo durante 4b. Se serve la suite completa, va passato esplicitamente l'URL di `gc_test`.

---

## 9. Fuori scope

- **Breadcrumb.** Il legacy ha una breadcrumb nell'header alimentata da `data.breadcrumb` di ogni route (incluse `/home` e `/login`, non solo le statistiche). È una feature trasversale di layout → **4d**.
- **Grafici interattivi oltre la parità** (zoom, drill-down, export): non esistono nel legacy.
- **Ottimizzazione del caricamento** (prefetch, `loader` di route al posto degli hook): 4a/4b usano hook Query nei componenti, si resta coerenti.
- **Correzione del quirk `statistics(A) → []`**: comportamento legacy dichiaratamente preservato in Fase 1.

---

## 10. Rischi

| Rischio | Mitigazione |
|---|---|
| Recharts non funziona col bundler HTML di Bun | Verifica presto: il primo task che introduce un grafico esegue `bun run build` e `bun run dev`. Recharts è ESM puro, nessun plugin richiesto. |
| Parità visiva dei colori non verificabile dai test | Le palette sono copiate verbatim da ngx-charts; la verifica resta il controllo manuale a fine branch (come in 4b). |
| `mediaMensile` dipende dalla data corrente | Data iniettabile → test deterministici. |
| Il bundle cresce di ~100 KB gz | Accettato: è la scelta esplicita dell'utente rispetto a un rendering a mano. |
