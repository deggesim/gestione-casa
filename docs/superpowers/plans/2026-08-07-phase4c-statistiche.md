# Fase 4c — Statistiche — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Portare le sei pagine della sezione Statistiche dall'Angular legacy a `apps/web`, con parità funzionale e visiva.

**Architecture:** Nuovo slice `apps/web/src/statistiche/` con la stessa forma di `andamento/`: hook TanStack Query separati dalle funzioni pure, componenti piccoli a responsabilità singola. Sei route piatte in `router.tsx` (non annidate: nel legacy il parent nasconde le proprie tabelle quando un figlio è attivo, quindi non c'è nulla da condividere) e un dropdown nella navbar per raggiungerle. I quattro schermi a barre — codice identico nel legacy — collassano in **un** componente parametrico.

**Tech Stack:** React 19 · TanStack Router (code-based) + TanStack Query · Eden Treaty · **Recharts 3** (nuova dipendenza, + peer `react-is`) · Bootstrap 5 / tema Minty · `bun test` + Testing Library + happy-dom.

**Spec:** `docs/superpowers/specs/2026-08-07-phase4c-statistiche-design.md` (commit `21d79d2`)

## Global Constraints

- **Branch:** `feat/phase4c-statistiche` off `master` @ `fc678de`. Un commit per task, autorizzati in anticipo dall'utente. PR verso `master` a fine implementazione.
- **4c è frontend-only.** Nessuna modifica a `apps/api` né a `packages/shared-types`.
- **Comando test — solo web:** `cd apps/web && bun test --preload ./happydom.ts`. **MAI `bun run test` dalla root** senza `DATABASE_URL` esplicito verso `gc_test`: eredita l'URL da `apps/api/.env` e `apps/api/test/setup.ts` fa `TRUNCATE` dello schema `gc` (incidente che ha azzerato il DB di sviluppo in 4b).
- **Divieto assoluto: nessun `mock.module('recharts')`**, e più in generale nessun nuovo `mock.module` in questa fase. In questo repo `mock.module` è process-global e `mock.restore()` non lo annulla (Bun 1.3.14): mock parziali hanno rotto la CI in 4a (`useAuth`) e in 4b (`sonner`). I test dei componenti usano **`QueryClient` con cache pre-popolata** (`setQueryData` + `staleTime: Infinity`). L'unica eccezione consentita è **estendere** il mock già esistente in `test/queries.test.tsx`, che va mantenuto un **superset**.
- **Nessuna asserzione sul contenuto dei grafici.** Sotto happy-dom `ResponsiveContainer` misura 0×0 e l'SVG resta vuoto (avviso `The width(0) and height(0) of chart should be greater than 0`, atteso e innocuo).
- **TypeScript:** `strict` + `noUncheckedIndexedAccess` + `verbatimModuleSyntax`. L'indicizzazione di un array produce `T | undefined`: serve `!` o un controllo. `import type` per i soli tipi.
- **Stile:** arrow function ovunque, `type` non `interface`, named export, import relativi, commenti in inglese. Formattazione Prettier (`bun run lint` = `prettier --check .`).
- **Gate per ogni task:** `cd apps/web && bun test --preload ./happydom.ts` verde, `bun run typecheck` (dalla root) exit 0, `bun run lint` pulito.
- **Palette copiate verbatim** dagli schemi ngx-charts `solar` (barre) e `natural` (torta).
- **Le stringhe dell'interfaccia sono italiane e vanno copiate alla lettera dal legacy** (titoli, etichette radio, intestazioni di tabella): sono parte della parità.

---

## File Structure

| File | Responsabilità | Task |
|---|---|---|
| `apps/web/src/statistiche/stats-utils.ts` | Funzioni pure + palette: `mediaMensile`, `formatMese`, `formatEuroInt`, `solarColor`, `naturalColor`, `SOLAR`, `NATURAL` | T1 |
| `apps/web/test/stats-utils.test.ts` | Test delle funzioni pure | T1 |
| `apps/web/src/statistiche/queries.ts` | `useStatistica`, `useSpeseFrequenti`, `useTutto`, tipo `StatisticaKind` | T2 |
| `apps/web/test/queries.test.tsx` (modifica) | +3 test, mock client esteso a `statistiche` | T2 |
| `apps/web/src/statistiche/IntervalRadio.tsx` | Fieldset + radio inline parametrici | T3 |
| `apps/web/src/statistiche/MediaTable.tsx` | Tabella Anno/Spesa | T3 |
| `apps/web/test/IntervalRadio.test.tsx`, `test/MediaTable.test.tsx` | Test dei due presentazionali | T3 |
| `apps/web/src/styles.css` (modifica) | `.fieldset`, `.legend` (T3); `.barre-orizzontali-*` (T5); `.torta` (T6) | T3/T5/T6 |
| `apps/web/src/statistiche/SpeseMedie.tsx` | Pagina `/statistiche`: 4× `MediaTable` | T4 |
| `apps/web/test/SpeseMedie.test.tsx` | Cache pre-popolata → 4 tabelle | T4 |
| `apps/web/src/statistiche/BarreStatistica.tsx` | Un componente → 4 route a barre | T5 |
| `apps/web/test/BarreStatistica.test.tsx` | Radio + cambio M→Y, nessun crash a 0×0 | T5 |
| `apps/web/src/statistiche/useMediaQuery.ts` | Hook `matchMedia` (sostituisce `ngx-device-detector`) | T6 |
| `apps/web/src/statistiche/SpeseFrequenti.tsx` | Torta + tabella spese comuni | T6 |
| `apps/web/test/SpeseFrequenti.test.tsx` | Radio a 3 opzioni + tabella | T6 |
| `apps/web/src/routes/router.tsx` (modifica) | 6 route (T4: 1, T5: 4, T6: 1) | T4/T5/T6 |
| `apps/web/src/layout/Layout.tsx` (modifica) | Dropdown "Statistiche" | T7 |
| `apps/web/test/Layout.test.tsx` (modifica) | +2 test sul dropdown | T7 |
| `apps/web/package.json` + `bun.lock` (modifica) | `recharts`, `react-is` | T5 |

Ordine dei task: le dipendenze vanno da T1 verso T7. T4 è la prima pagina navigabile; T5 introduce Recharts; T7 rende tutto raggiungibile dall'interfaccia.

---

## Task 1: Funzioni pure e palette (`stats-utils.ts`)

**Files:**
- Create: `apps/web/src/statistiche/stats-utils.ts`
- Test: `apps/web/test/stats-utils.test.ts`

**Interfaces:**
- Consumes: `Statistica` da `@gc/shared-types`.
- Produces:
  - `SOLAR: readonly string[]`, `NATURAL: readonly string[]`
  - `formatEuroInt(n: number): string`
  - `formatMese(name: string): string`
  - `mediaMensile(rows: Statistica[], now?: Date): Statistica[]`
  - `solarColor(value: number, min: number, max: number): string`
  - `naturalColor(i: number): string`

- [ ] **Step 1: Write the failing test**

`apps/web/test/stats-utils.test.ts`:

```ts
import { test, expect } from 'bun:test';
import {
  formatEuroInt,
  formatMese,
  mediaMensile,
  naturalColor,
  NATURAL,
  solarColor,
  SOLAR,
} from '../src/statistiche/stats-utils';

test('formatMese turns "YYYYMM" into the Italian month + year', () => {
  expect(formatMese('202607')).toBe('luglio 2026');
  expect(formatMese('202601')).toBe('gennaio 2026');
  expect(formatMese('199912')).toBe('dicembre 1999');
});

test('formatEuroInt formats euros with no decimals', () => {
  // it-IT uses a narrow no-break space before the symbol; assert on the parts.
  const out = formatEuroInt(1234.56);
  expect(out).toContain('1.235');
  expect(out).toContain('€');
  expect(out).not.toContain(',');
});

test('mediaMensile divides past years by 12 and the running year by months elapsed', () => {
  const now = new Date(2026, 6, 15); // July 2026 -> getMonth() 6 -> divisor 7
  const rows = [
    { name: '2026', value: 700 },
    { name: '2025', value: 1200 },
  ];
  expect(mediaMensile(rows, now)).toEqual([
    { name: '2026', value: 100 },
    { name: '2025', value: 100 },
  ]);
});

test('mediaMensile divides by 1 in January of the running year', () => {
  const now = new Date(2026, 0, 3); // getMonth() 0 -> divisor 1
  expect(mediaMensile([{ name: '2026', value: 42 }], now)).toEqual([{ name: '2026', value: 42 }]);
});

test('mediaMensile keeps only the last 10 years (strictly greater than year - 10)', () => {
  const now = new Date(2026, 6, 15);
  const rows = [
    { name: '2017', value: 12 }, // 2017 > 2016 -> kept
    { name: '2016', value: 12 }, // 2016 > 2016 is false -> dropped
    { name: '2010', value: 12 },
  ];
  expect(mediaMensile(rows, now).map((r) => r.name)).toEqual(['2017']);
});

test('mediaMensile on an empty list returns an empty list', () => {
  expect(mediaMensile([], new Date(2026, 6, 15))).toEqual([]);
});

test('solarColor maps the value onto the SOLAR ramp', () => {
  expect(solarColor(0, 0, 100)).toBe(SOLAR[0]!);
  expect(solarColor(100, 0, 100)).toBe(SOLAR[SOLAR.length - 1]!);
  expect(solarColor(50, 0, 100)).toBe(SOLAR[Math.round((SOLAR.length - 1) / 2)]!);
});

test('solarColor returns the top stop when the domain is degenerate', () => {
  expect(solarColor(7, 7, 7)).toBe(SOLAR[SOLAR.length - 1]!);
});

test('naturalColor cycles through the NATURAL palette', () => {
  expect(naturalColor(0)).toBe(NATURAL[0]!);
  expect(naturalColor(NATURAL.length)).toBe(NATURAL[0]!);
  expect(naturalColor(NATURAL.length + 2)).toBe(NATURAL[2]!);
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `cd apps/web && bun test --preload ./happydom.ts test/stats-utils.test.ts`
Expected: FAIL — il modulo `../src/statistiche/stats-utils` non esiste.

- [ ] **Step 3: Write the implementation**

`apps/web/src/statistiche/stats-utils.ts`:

```ts
import type { Statistica } from '@gc/shared-types';

// ngx-charts colour sets, copied verbatim so the ported charts keep the legacy palette.
export const SOLAR = [
  '#fff8e1',
  '#ffecb3',
  '#ffe082',
  '#ffd54f',
  '#ffca28',
  '#ffc107',
  '#ffb300',
  '#ffa000',
  '#ff8f00',
  '#ff6f00',
] as const;

export const NATURAL = [
  '#bf9d76',
  '#e99450',
  '#d89f59',
  '#f2dfa7',
  '#a5d7c6',
  '#7794b1',
  '#afafaf',
  '#707160',
  '#ba9383',
  '#d9d5c3',
] as const;

// Axis ticks drop the cents (legacy xAxisTickFormatting); tooltips and tables
// keep two decimals via formatCosto from the andamento slice.
const eurInt = new Intl.NumberFormat('it-IT', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});
export const formatEuroInt = (n: number): string => eurInt.format(n);

const meseAnno = new Intl.DateTimeFormat('it-IT', { month: 'long', year: 'numeric' });

// "202607" -> "luglio 2026". The legacy used luxon
// (DateTime.fromFormat(name, 'yyyyMM').setLocale('it-IT').toFormat('MMMM yyyy'));
// Intl produces the same string without the dependency.
export const formatMese = (name: string): string =>
  meseAnno.format(new Date(Number(name.slice(0, 4)), Number(name.slice(4, 6)) - 1, 1));

// Legacy: yearly totals of the last 10 years turned into monthly averages.
// The running year divides by the months elapsed so far, not by 12.
// `now` is injectable so the tests don't depend on the wall clock.
export const mediaMensile = (rows: Statistica[], now: Date = new Date()): Statistica[] => {
  const anno = now.getFullYear();
  const mesiTrascorsi = now.getMonth() + 1;
  return rows
    .filter((r) => Number(r.name) > anno - 10)
    .map((r) => ({
      name: r.name,
      value: r.value / (Number(r.name) === anno ? mesiTrascorsi : 12),
    }));
};

// Parity with ngx-charts schemeType Linear: the value's position within the
// domain picks a stop of the ramp (higher spend = hotter colour).
export const solarColor = (value: number, min: number, max: number): string => {
  const ratio = max === min ? 1 : (value - min) / (max - min);
  const last = SOLAR.length - 1;
  const i = Math.min(last, Math.max(0, Math.round(ratio * last)));
  return SOLAR[i]!;
};

// Ordinal palette for the pie: cycle when there are more slices than colours.
export const naturalColor = (i: number): string => NATURAL[i % NATURAL.length]!;
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `cd apps/web && bun test --preload ./happydom.ts test/stats-utils.test.ts`
Expected: PASS, 9 test.

Se `formatMese` fallisce sulla capitalizzazione o su uno spazio, **non forzare la stringa**: verifica prima l'output reale con `bun -e "console.log(new Intl.DateTimeFormat('it-IT',{month:'long',year:'numeric'}).format(new Date(2026,6,1)))"` e allinea il test all'output di ICU (l'obiettivo è la parità con Luxon, che usa gli stessi dati CLDR).

- [ ] **Step 5: Run the full web suite, typecheck and lint**

Run:
```bash
cd apps/web && bun test --preload ./happydom.ts
cd ../.. && bun run typecheck && bun run lint
```
Expected: suite verde (46 test preesistenti + 9 nuovi), typecheck exit 0, prettier pulito.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/statistiche/stats-utils.ts apps/web/test/stats-utils.test.ts
git commit -m "feat(web): statistiche pure helpers (monthly average, month label, palettes)"
```

---

## Task 2: Hook Query (`queries.ts`)

**Files:**
- Create: `apps/web/src/statistiche/queries.ts`
- Modify: `apps/web/test/queries.test.tsx` (estende il mock del client e aggiunge 3 test)

**Interfaces:**
- Consumes: `apiClient` da `../api/client`; `IntervalValue` da `@gc/shared-types`.
- Produces:
  - `type StatisticaKind = 'spesa' | 'carburante' | 'bolletta' | 'casa'`
  - `useStatistica(kind: StatisticaKind, interval: IntervalValue)` → query key `['statistiche', kind, interval]`
  - `useSpeseFrequenti(interval: IntervalValue)` → `['statistiche', 'spese-frequenti', interval]`
  - `useTutto()` → `['statistiche', 'tutto', 'Y']`
  - Tutti restituiscono `Statistica[]` in `data`.

- [ ] **Step 1: Write the failing test**

In `apps/web/test/queries.test.tsx`, estendere il mock del client **mantenendolo un superset** (aggiungere, non sostituire) e aggiungere i test in coda.

Dentro l'oggetto `apiClient` del `mock.module` esistente, dopo la voce `'tipo-spesa'`, inserire:

```ts
    statistiche: {
      spesa: statistiche,
      carburante: statistiche,
      bolletta: statistiche,
      casa: statistiche,
      'spese-frequenti': statistiche,
      tutto: statistiche,
    },
```

e sopra la chiamata a `mock.module`, accanto agli altri mock:

```ts
const statsGet = mock(async () => ({ data: [{ name: '2026', value: 12 }], error: null }));
const statistiche = mock((_args: { interval: string }) => ({ get: statsGet }));
```

In coda al file, i tre test:

```ts
test('useStatistica calls the endpoint for its kind with the interval', async () => {
  statistiche.mockClear();
  const { useStatistica } = await import('../src/statistiche/queries');
  const { result } = renderHook(() => useStatistica('carburante', 'Y'), {
    wrapper: wrapper(freshQc()),
  });
  await waitFor(() => expect(result.current.data as unknown).toEqual([{ name: '2026', value: 12 }]));
  expect(statistiche).toHaveBeenCalledWith({ interval: 'Y' });
});

test('useSpeseFrequenti passes the interval through', async () => {
  statistiche.mockClear();
  const { useSpeseFrequenti } = await import('../src/statistiche/queries');
  const { result } = renderHook(() => useSpeseFrequenti('A'), { wrapper: wrapper(freshQc()) });
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(statistiche).toHaveBeenCalledWith({ interval: 'A' });
});

test('useTutto is always yearly', async () => {
  statistiche.mockClear();
  const { useTutto } = await import('../src/statistiche/queries');
  const { result } = renderHook(() => useTutto(), { wrapper: wrapper(freshQc()) });
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(statistiche).toHaveBeenCalledWith({ interval: 'Y' });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `cd apps/web && bun test --preload ./happydom.ts test/queries.test.tsx`
Expected: FAIL — `../src/statistiche/queries` non esiste.

- [ ] **Step 3: Write the implementation**

`apps/web/src/statistiche/queries.ts`:

```ts
import { useQuery } from '@tanstack/react-query';
import type { IntervalValue } from '@gc/shared-types';
import { apiClient } from '../api/client';

// One thunk per endpoint instead of indexing the Eden client with a union key:
// a union of call signatures is not reliably callable under TS, and the explicit
// map costs the same four lines.
const fetchers = {
  spesa: (interval: IntervalValue) => apiClient.statistiche.spesa({ interval }).get(),
  carburante: (interval: IntervalValue) => apiClient.statistiche.carburante({ interval }).get(),
  bolletta: (interval: IntervalValue) => apiClient.statistiche.bolletta({ interval }).get(),
  casa: (interval: IntervalValue) => apiClient.statistiche.casa({ interval }).get(),
};

export type StatisticaKind = keyof typeof fetchers;

export const useStatistica = (kind: StatisticaKind, interval: IntervalValue) =>
  useQuery({
    queryKey: ['statistiche', kind, interval],
    queryFn: async () => {
      const { data, error } = await fetchers[kind](interval);
      if (error) throw error;
      return data;
    },
  });

export const useSpeseFrequenti = (interval: IntervalValue) =>
  useQuery({
    queryKey: ['statistiche', 'spese-frequenti', interval],
    queryFn: async () => {
      const { data, error } = await apiClient.statistiche['spese-frequenti']({ interval }).get();
      if (error) throw error;
      return data;
    },
  });

// The "spese comuni" table is always yearly (legacy StatisticheCompleteResolver
// hardcodes 'Y'); the radio on that screen only drives the pie.
export const useTutto = () =>
  useQuery({
    queryKey: ['statistiche', 'tutto', 'Y'],
    queryFn: async () => {
      const { data, error } = await apiClient.statistiche.tutto({ interval: 'Y' }).get();
      if (error) throw error;
      return data;
    },
  });
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `cd apps/web && bun test --preload ./happydom.ts test/queries.test.tsx`
Expected: PASS, 6 test (3 preesistenti + 3 nuovi).

- [ ] **Step 5: Full gate**

Run:
```bash
cd apps/web && bun test --preload ./happydom.ts
cd ../.. && bun run typecheck && bun run lint
```

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/statistiche/queries.ts apps/web/test/queries.test.tsx
git commit -m "feat(web): statistiche Query hooks (per-kind, spese-frequenti, tutto)"
```

---

## Task 3: Presentazionali (`IntervalRadio`, `MediaTable`) + CSS del fieldset

**Files:**
- Create: `apps/web/src/statistiche/IntervalRadio.tsx`, `apps/web/src/statistiche/MediaTable.tsx`
- Modify: `apps/web/src/styles.css` (aggiunge `.fieldset` e `.legend`)
- Test: `apps/web/test/IntervalRadio.test.tsx`, `apps/web/test/MediaTable.test.tsx`

**Interfaces:**
- Consumes: `IntervalValue` da `@gc/shared-types`; `Statistica` da `@gc/shared-types`; `formatCosto` da `../andamento/list-utils`.
- Produces:
  - `type IntervalOption = { value: IntervalValue; label: string }`
  - `IntervalRadio({ legend, options, value, onChange })` — `onChange: (v: IntervalValue) => void`
  - `MediaTable({ titolo, sottotitolo?, rows })` — `rows: Statistica[]`, rende `<h4>{titolo}</h4>`, opzionale `<h5>{sottotitolo}</h5>`, poi una tabella con `aria-label={titolo}` e intestazioni `Anno` / `Spesa`.

- [ ] **Step 1: Write the failing tests**

`apps/web/test/IntervalRadio.test.tsx`:

```tsx
import { test, expect } from 'bun:test';
import { render, screen, fireEvent } from '@testing-library/react';
import { IntervalRadio } from '../src/statistiche/IntervalRadio';

const options = [
  { value: 'M' as const, label: 'Mensile' },
  { value: 'Y' as const, label: 'Annuale' },
];

test('renders the legend and one radio per option, with the current one checked', () => {
  render(<IntervalRadio legend="Frequenza" options={options} value="Y" onChange={() => {}} />);
  expect(screen.getByText('Frequenza')).toBeDefined();
  expect((screen.getByLabelText('Mensile') as HTMLInputElement).checked).toBe(false);
  expect((screen.getByLabelText('Annuale') as HTMLInputElement).checked).toBe(true);
});

test('calls onChange with the clicked value', () => {
  let picked = '';
  render(
    <IntervalRadio legend="Frequenza" options={options} value="M" onChange={(v) => (picked = v)} />,
  );
  fireEvent.click(screen.getByLabelText('Annuale'));
  expect(picked).toBe('Y');
});
```

`apps/web/test/MediaTable.test.tsx`:

```tsx
import { test, expect } from 'bun:test';
import { render, screen, within } from '@testing-library/react';
import { MediaTable } from '../src/statistiche/MediaTable';

test('renders the title, the Anno/Spesa headers and one formatted row per entry', () => {
  render(
    <MediaTable
      titolo="Media spesa mensile"
      rows={[
        { name: '2026', value: 100 },
        { name: '2025', value: 250.5 },
      ]}
    />,
  );
  const table = screen.getByRole('table', { name: 'Media spesa mensile' });
  expect(within(table).getByText('Anno')).toBeDefined();
  expect(within(table).getByText('Spesa')).toBeDefined();
  expect(within(table).getAllByRole('row').length).toBe(3); // header + 2
  expect(within(table).getByText('2026')).toBeDefined();
  // it-IT currency: "100,00 €" (narrow no-break space before the symbol).
  expect(within(table).getByText(/100,00/)).toBeDefined();
  expect(within(table).getByText(/250,50/)).toBeDefined();
});

test('renders the optional subtitle', () => {
  render(<MediaTable titolo="T" sottotitolo="(spesa, carburante)" rows={[]} />);
  expect(screen.getByText('(spesa, carburante)')).toBeDefined();
});
```

- [ ] **Step 2: Run and confirm they fail**

Run: `cd apps/web && bun test --preload ./happydom.ts test/IntervalRadio.test.tsx test/MediaTable.test.tsx`
Expected: FAIL — moduli inesistenti.

- [ ] **Step 3: Write the implementations**

`apps/web/src/statistiche/IntervalRadio.tsx`:

```tsx
import type { IntervalValue } from '@gc/shared-types';

export type IntervalOption = { value: IntervalValue; label: string };

type Props = {
  legend: string;
  options: IntervalOption[];
  value: IntervalValue;
  onChange: (value: IntervalValue) => void;
};

// Legacy markup: <fieldset class="fieldset"><legend class="legend"> + inline radios.
// The legend's light/dark background was an ngClass on themeService in Angular;
// Bootstrap 5.3's theme-aware `bg-body` does the same job under data-bs-theme.
export const IntervalRadio = ({ legend, options, value, onChange }: Props) => (
  <fieldset className="fieldset">
    <legend className="legend bg-body">{legend}</legend>
    <div className="pt-1 text-center">
      {options.map((o) => (
        <div className="form-check form-check-inline" key={o.value}>
          <input
            type="radio"
            className="form-check-input"
            id={`intervallo-${o.value}`}
            value={o.value}
            checked={value === o.value}
            onChange={() => onChange(o.value)}
          />
          <label className="form-check-label" htmlFor={`intervallo-${o.value}`}>
            {o.label}
          </label>
        </div>
      ))}
    </div>
  </fieldset>
);
```

`apps/web/src/statistiche/MediaTable.tsx`:

```tsx
import type { Statistica } from '@gc/shared-types';
import { formatCosto } from '../andamento/list-utils';

type Props = { titolo: string; sottotitolo?: string; rows: Statistica[] };

// Legacy: a two-column "Anno / Spesa" table under an h4, repeated five times
// across the statistiche screens.
export const MediaTable = ({ titolo, sottotitolo, rows }: Props) => (
  <>
    <h4 className="text-nowrap overflow-hidden">{titolo}</h4>
    {sottotitolo ? <h5>{sottotitolo}</h5> : null}
    <div className="table-responsive">
      <table className="table table-hover" aria-label={titolo}>
        <thead>
          <tr>
            <th scope="col">Anno</th>
            <th scope="col">Spesa</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name}>
              <td>{r.name}</td>
              <td>{formatCosto(r.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </>
);
```

In coda a `apps/web/src/styles.css`:

```css
/* Statistiche: radio group box (was .fieldset/.legend in the legacy styles.scss).
   $primary of the Minty theme is #78c2ad; transparentize(...,0.7) -> 30% alpha. */
.fieldset {
  background: rgba(120, 194, 173, 0.3);
  margin: 1rem;
  border-radius: 0.5rem;
  padding: 0.35em 0.625em 0;
  border: 1px solid var(--bs-border-color);
}

.fieldset .legend {
  border: 1px solid var(--bs-border-color);
  border-radius: 0.5rem;
  padding-left: 0.5rem;
  padding-right: 0.5rem;
  width: inherit;
  margin-bottom: auto;
  font-size: 15px;
}
```

- [ ] **Step 4: Run and confirm they pass**

Run: `cd apps/web && bun test --preload ./happydom.ts test/IntervalRadio.test.tsx test/MediaTable.test.tsx`
Expected: PASS, 4 test.

- [ ] **Step 5: Full gate**

Run:
```bash
cd apps/web && bun test --preload ./happydom.ts
cd ../.. && bun run typecheck && bun run lint
```

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/statistiche/IntervalRadio.tsx apps/web/src/statistiche/MediaTable.tsx \
        apps/web/src/styles.css apps/web/test/IntervalRadio.test.tsx apps/web/test/MediaTable.test.tsx
git commit -m "feat(web): statistiche presentational parts (interval radios, average table)"
```

---

## Task 4: Pagina "Spese medie" + prima route

**Files:**
- Create: `apps/web/src/statistiche/SpeseMedie.tsx`
- Modify: `apps/web/src/routes/router.tsx`
- Test: `apps/web/test/SpeseMedie.test.tsx`

**Interfaces:**
- Consumes: `useStatistica` + `StatisticaKind` (T2), `mediaMensile` (T1), `MediaTable` (T3).
- Produces: `SpeseMedie()` — nessuna prop; è il componente della route `/statistiche`.

Titoli, **verbatim dal legacy** e in quest'ordine: `Media bolletta mensile`, `Media spesa mensile`, `Media carburante mensile`, `Media casa mensile`.

- [ ] **Step 1: Write the failing test**

`apps/web/test/SpeseMedie.test.tsx`:

```tsx
import { test, expect } from 'bun:test';
import { render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { SpeseMedie } from '../src/statistiche/SpeseMedie';

// Seeded cache instead of a module mock: staleTime Infinity means the four
// queries resolve straight from the cache and nothing hits the network.
const renderPage = () => {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  const anno = String(new Date().getFullYear() - 1); // a full past year -> divisor 12
  for (const kind of ['bolletta', 'spesa', 'carburante', 'casa']) {
    qc.setQueryData(['statistiche', kind, 'Y'], [{ name: anno, value: 1200 }]);
  }
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  render(<SpeseMedie />, { wrapper });
  return anno;
};

test('renders the four average tables with their legacy titles', () => {
  renderPage();
  for (const titolo of [
    'Media bolletta mensile',
    'Media spesa mensile',
    'Media carburante mensile',
    'Media casa mensile',
  ]) {
    expect(screen.getByRole('table', { name: titolo })).toBeDefined();
  }
});

test('divides a full past year by 12', () => {
  const anno = renderPage();
  const table = screen.getByRole('table', { name: 'Media spesa mensile' });
  expect(within(table).getByText(anno)).toBeDefined();
  expect(within(table).getByText(/100,00/)).toBeDefined(); // 1200 / 12
});
```

- [ ] **Step 2: Run and confirm it fails**

Run: `cd apps/web && bun test --preload ./happydom.ts test/SpeseMedie.test.tsx`
Expected: FAIL — `../src/statistiche/SpeseMedie` non esiste.

- [ ] **Step 3: Write the implementation**

`apps/web/src/statistiche/SpeseMedie.tsx`:

```tsx
import { MediaTable } from './MediaTable';
import { useStatistica, type StatisticaKind } from './queries';
import { mediaMensile } from './stats-utils';

// One child component per series: each needs its own hook, and hooks can't be
// called from inside a map in the parent.
const MediaSerie = ({ kind, titolo }: { kind: StatisticaKind; titolo: string }) => {
  const { data } = useStatistica(kind, 'Y');
  return (
    <div className="col-md-6">
      <MediaTable titolo={titolo} rows={mediaMensile(data ?? [])} />
    </div>
  );
};

// Titles copied verbatim from the legacy StatisticheComponent template.
const SERIE: { kind: StatisticaKind; titolo: string }[] = [
  { kind: 'bolletta', titolo: 'Media bolletta mensile' },
  { kind: 'spesa', titolo: 'Media spesa mensile' },
  { kind: 'carburante', titolo: 'Media carburante mensile' },
  { kind: 'casa', titolo: 'Media casa mensile' },
];

// Legacy /statistiche landing page: four yearly series shown as monthly averages.
export const SpeseMedie = () => (
  <div className="row">
    {SERIE.map((s) => (
      <MediaSerie key={s.kind} kind={s.kind} titolo={s.titolo} />
    ))}
  </div>
);
```

- [ ] **Step 4: Run and confirm it passes**

Run: `cd apps/web && bun test --preload ./happydom.ts test/SpeseMedie.test.tsx`
Expected: PASS, 2 test.

- [ ] **Step 5: Wire the route**

In `apps/web/src/routes/router.tsx`, aggiungere l'import

```tsx
import { SpeseMedie } from '../statistiche/SpeseMedie';
```

la route dopo `homeRoute`

```tsx
  const statisticheRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/statistiche',
    beforeLoad: requireAuth(queryClient),
    component: SpeseMedie,
  });
```

e inserirla in `addChildren`:

```tsx
  const routeTree = rootRoute.addChildren([
    indexRoute,
    loginRoute,
    homeRoute,
    statisticheRoute,
    errorRoute,
  ]);
```

- [ ] **Step 6: Full gate + build**

Run:
```bash
cd apps/web && bun test --preload ./happydom.ts && bun run build
cd ../.. && bun run typecheck && bun run lint
```
Expected: suite verde, build del bundler OK, typecheck exit 0, prettier pulito.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/statistiche/SpeseMedie.tsx apps/web/test/SpeseMedie.test.tsx apps/web/src/routes/router.tsx
git commit -m "feat(web): 'Spese medie' page at /statistiche"
```

---

## Task 5: Schermi a barre (Recharts) + 4 route

**Files:**
- Modify: `apps/web/package.json`, `bun.lock` (aggiunge `recharts`, `react-is`)
- Create: `apps/web/src/statistiche/BarreStatistica.tsx`
- Modify: `apps/web/src/styles.css` (aggiunge `.barre-orizzontali-mensile`, `.barre-orizzontali-annuale`), `apps/web/src/routes/router.tsx`
- Test: `apps/web/test/BarreStatistica.test.tsx`

**Interfaces:**
- Consumes: `useStatistica` + `StatisticaKind` (T2), `formatEuroInt`/`formatMese`/`solarColor` (T1), `IntervalRadio` (T3), `formatCosto` da `../andamento/list-utils`.
- Produces: `BarreStatistica({ kind }: { kind: StatisticaKind })` — usato da 4 route con `kind` diverso.

- [ ] **Step 1: Install the dependency**

Run (dalla root del monorepo):
```bash
bun add --cwd apps/web recharts react-is
```
Expected: `recharts@^3.x` e `react-is` in `apps/web/package.json`, `bun.lock` aggiornato.

Verificare subito che il bundler regga la libreria: `cd apps/web && bun run build` → deve completare senza errori. Se fallisce, **fermarsi e segnalarlo**: è il rischio principale della fase e non va aggirato con configurazioni improvvisate.

- [ ] **Step 2: Write the failing test**

`apps/web/test/BarreStatistica.test.tsx`:

```tsx
import { test, expect } from 'bun:test';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { BarreStatistica } from '../src/statistiche/BarreStatistica';

// Recharts renders nothing under happy-dom (ResponsiveContainer measures 0x0),
// so these tests cover the controls around the chart, never the SVG.
const renderBarre = () => {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  qc.setQueryData(['statistiche', 'spesa', 'M'], [{ name: '202607', value: 10 }]);
  qc.setQueryData(['statistiche', 'spesa', 'Y'], [{ name: '2026', value: 120 }]);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return render(<BarreStatistica kind="spesa" />, { wrapper });
};

test('starts monthly, with the legacy "Frequenza" radios', () => {
  renderBarre();
  expect(screen.getByText('Frequenza')).toBeDefined();
  expect((screen.getByLabelText('Mensile') as HTMLInputElement).checked).toBe(true);
  expect((screen.getByLabelText('Annuale') as HTMLInputElement).checked).toBe(false);
});

test('switching to Annuale swaps the chart container class', async () => {
  const { container } = renderBarre();
  expect(container.querySelector('.barre-orizzontali-mensile')).not.toBeNull();
  fireEvent.click(screen.getByLabelText('Annuale'));
  await waitFor(() => expect(container.querySelector('.barre-orizzontali-annuale')).not.toBeNull());
  expect(container.querySelector('.barre-orizzontali-mensile')).toBeNull();
});
```

- [ ] **Step 3: Run and confirm it fails**

Run: `cd apps/web && bun test --preload ./happydom.ts test/BarreStatistica.test.tsx`
Expected: FAIL — `../src/statistiche/BarreStatistica` non esiste.

- [ ] **Step 4: Write the implementation**

`apps/web/src/statistiche/BarreStatistica.tsx`:

```tsx
import { useState } from 'react';
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { IntervalValue } from '@gc/shared-types';
import { formatCosto } from '../andamento/list-utils';
import { IntervalRadio, type IntervalOption } from './IntervalRadio';
import { useStatistica, type StatisticaKind } from './queries';
import { formatEuroInt, formatMese, solarColor } from './stats-utils';

const OPTIONS: IntervalOption[] = [
  { value: 'M', label: 'Mensile' },
  { value: 'Y', label: 'Annuale' },
];

// The four legacy bar screens (spesa, carburante, bolletta, casa) were the same
// component with a different service call, so they collapse into this one.
export const BarreStatistica = ({ kind }: { kind: StatisticaKind }) => {
  const [intervallo, setIntervallo] = useState<IntervalValue>('M');
  const { data } = useStatistica(kind, intervallo);

  // Monthly names arrive as "YYYYMM" and are shown as "luglio 2026"; yearly ones
  // are already "YYYY". The legacy mutated the fetched objects in place — here the
  // formatting happens on the way to the chart.
  const rows = (data ?? []).map((r) => ({
    name: intervallo === 'M' ? formatMese(r.name) : r.name,
    value: r.value,
  }));
  const values = rows.map((r) => r.value);
  const min = values.length ? Math.min(...values) : 0;
  const max = values.length ? Math.max(...values) : 0;

  return (
    <>
      <IntervalRadio
        legend="Frequenza"
        options={OPTIONS}
        value={intervallo}
        onChange={setIntervallo}
      />
      {/* Monthly shows up to 48 bars, so the legacy gives it three viewport
          heights of scroll; yearly fits in one. */}
      <div className={intervallo === 'M' ? 'barre-orizzontali-mensile' : 'barre-orizzontali-annuale'}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} layout="vertical" margin={{ top: 5, right: 30, bottom: 25, left: 20 }}>
            <XAxis
              type="number"
              tickFormatter={formatEuroInt}
              label={{ value: 'Importo', position: 'insideBottom', offset: -15 }}
            />
            {/* "Mese" even in yearly mode: the legacy template hardcodes it. */}
            <YAxis
              type="category"
              dataKey="name"
              width={110}
              interval={0}
              label={{ value: 'Mese', angle: -90, position: 'insideLeft' }}
            />
            <Tooltip formatter={(value: number) => formatCosto(value)} />
            <Bar dataKey="value" isAnimationActive={false}>
              {rows.map((r) => (
                <Cell key={r.name} fill={solarColor(r.value, min, max)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </>
  );
};
```

In coda a `apps/web/src/styles.css`:

```css
/* Statistiche charts: heights copied from the legacy styles.scss. Monthly bars
   can be 48 rows, hence three viewport heights of scroll. */
.barre-orizzontali-mensile {
  height: calc((100vh - 210px) * 3);
}

.barre-orizzontali-annuale {
  height: calc(100vh - 210px);
}
```

- [ ] **Step 5: Run and confirm it passes**

Run: `cd apps/web && bun test --preload ./happydom.ts test/BarreStatistica.test.tsx`
Expected: PASS, 2 test. Sono attesi (e innocui) messaggi su stderr del tipo `The width(0) and height(0) of chart should be greater than 0`.

- [ ] **Step 6: Wire the four routes**

In `apps/web/src/routes/router.tsx`, aggiungere l'import

```tsx
import { BarreStatistica } from '../statistiche/BarreStatistica';
```

le quattro route dopo `statisticheRoute`

```tsx
  const barreRoutes = (['spesa', 'carburante', 'bolletta', 'casa'] as const).map((kind) =>
    createRoute({
      getParentRoute: () => rootRoute,
      path: `/statistiche/${kind}`,
      beforeLoad: requireAuth(queryClient),
      component: () => <BarreStatistica kind={kind} />,
    }),
  );
```

e inserirle in `addChildren`:

```tsx
  const routeTree = rootRoute.addChildren([
    indexRoute,
    loginRoute,
    homeRoute,
    statisticheRoute,
    ...barreRoutes,
    errorRoute,
  ]);
```

Se TanStack Router rifiuta il `path` costruito da template literal per motivi di tipizzazione, sostituire il `map` con quattro `createRoute` espliciti — è un'espansione meccanica, non un cambio di design.

- [ ] **Step 7: Full gate + build**

Run:
```bash
cd apps/web && bun test --preload ./happydom.ts && bun run build
cd ../.. && bun run typecheck && bun run lint
```

- [ ] **Step 8: Commit**

```bash
git add apps/web/package.json bun.lock apps/web/src/statistiche/BarreStatistica.tsx \
        apps/web/src/styles.css apps/web/src/routes/router.tsx apps/web/test/BarreStatistica.test.tsx
git commit -m "feat(web): horizontal bar statistiche screens (recharts) at /statistiche/{spesa,carburante,bolletta,casa}"
```

---

## Task 6: "Spese frequenti" (torta) + route

**Files:**
- Create: `apps/web/src/statistiche/useMediaQuery.ts`, `apps/web/src/statistiche/SpeseFrequenti.tsx`
- Modify: `apps/web/src/styles.css` (aggiunge `.torta`), `apps/web/src/routes/router.tsx`
- Test: `apps/web/test/SpeseFrequenti.test.tsx`

**Interfaces:**
- Consumes: `useSpeseFrequenti` + `useTutto` (T2), `mediaMensile`/`naturalColor` (T1), `IntervalRadio` (T3), `MediaTable` (T3), `formatCosto` da `../andamento/list-utils`.
- Produces: `useMediaQuery(query: string): boolean`; `SpeseFrequenti()` — componente della route `/statistiche/spese-frequenti`.

- [ ] **Step 1: Write the failing test**

`apps/web/test/SpeseFrequenti.test.tsx`:

```tsx
import { test, expect } from 'bun:test';
import { render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { SpeseFrequenti } from '../src/statistiche/SpeseFrequenti';

const renderPage = () => {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  const anno = String(new Date().getFullYear() - 1);
  qc.setQueryData(
    ['statistiche', 'spese-frequenti', 'M'],
    [{ name: 'spesa', value: 80 }, { name: 'carburante', value: 20 }],
  );
  qc.setQueryData(['statistiche', 'tutto', 'Y'], [{ name: anno, value: 2400 }]);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  render(<SpeseFrequenti />, { wrapper });
  return anno;
};

test('offers the three legacy range options, monthly by default', () => {
  renderPage();
  expect(screen.getByText('Range')).toBeDefined();
  expect((screen.getByLabelText('Ultimo mese') as HTMLInputElement).checked).toBe(true);
  expect(screen.getByLabelText('Ultimo anno')).toBeDefined();
  expect(screen.getByLabelText('Tutto')).toBeDefined();
});

test('shows the common-expenses monthly average table', () => {
  const anno = renderPage();
  const table = screen.getByRole('table', { name: 'Media mensile spese comuni' });
  expect(within(table).getByText(anno)).toBeDefined();
  expect(within(table).getByText(/200,00/)).toBeDefined(); // 2400 / 12
});
```

- [ ] **Step 2: Run and confirm it fails**

Run: `cd apps/web && bun test --preload ./happydom.ts test/SpeseFrequenti.test.tsx`
Expected: FAIL — modulo inesistente.

- [ ] **Step 3: Write the implementations**

`apps/web/src/statistiche/useMediaQuery.ts`:

```ts
import { useEffect, useState } from 'react';

// Replaces the legacy ngx-device-detector (isDesktop/isTablet) with the Bootstrap
// breakpoints the rest of the layout already uses.
export const useMediaQuery = (query: string): boolean => {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);
  return matches;
};
```

`apps/web/src/statistiche/SpeseFrequenti.tsx`:

```tsx
import { useState } from 'react';
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import type { IntervalValue } from '@gc/shared-types';
import { formatCosto } from '../andamento/list-utils';
import { IntervalRadio, type IntervalOption } from './IntervalRadio';
import { MediaTable } from './MediaTable';
import { useSpeseFrequenti, useTutto } from './queries';
import { mediaMensile, naturalColor } from './stats-utils';
import { useMediaQuery } from './useMediaQuery';

const OPTIONS: IntervalOption[] = [
  { value: 'M', label: 'Ultimo mese' },
  { value: 'Y', label: 'Ultimo anno' },
  { value: 'A', label: 'Tutto' },
];

export const SpeseFrequenti = () => {
  const [intervallo, setIntervallo] = useState<IntervalValue>('M');
  const torta = useSpeseFrequenti(intervallo);
  const comuni = useTutto();
  // Legacy: labels on desktop only, legend on desktop or tablet.
  const showLabels = useMediaQuery('(min-width: 992px)');
  const showLegend = useMediaQuery('(min-width: 768px)');
  const rows = torta.data ?? [];

  return (
    <>
      <IntervalRadio legend="Range" options={OPTIONS} value={intervallo} onChange={setIntervallo} />
      <div className="torta">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={rows} dataKey="value" nameKey="name" label={showLabels} isAnimationActive={false}>
              {rows.map((r, i) => (
                <Cell key={r.name} fill={naturalColor(i)} />
              ))}
            </Pie>
            <Tooltip formatter={(value: number, name: string) => [formatCosto(value), name]} />
            {showLegend ? <Legend layout="vertical" align="right" verticalAlign="middle" /> : null}
          </PieChart>
        </ResponsiveContainer>
      </div>
      <MediaTable
        titolo="Media mensile spese comuni"
        sottotitolo="(spesa, carburante, auto, bollette, casa, gatti, condominio e Veronica)"
        rows={mediaMensile(comuni.data ?? [])}
      />
    </>
  );
};
```

In coda a `apps/web/src/styles.css`:

```css
.torta {
  height: calc(100vh - 210px);
}
```

- [ ] **Step 4: Run and confirm it passes**

Run: `cd apps/web && bun test --preload ./happydom.ts test/SpeseFrequenti.test.tsx`
Expected: PASS, 2 test.

Se `window.matchMedia` non esiste sotto happy-dom, **non** aggiungere un mock globale: usare `window.matchMedia?.(query)?.matches ?? false` come valore iniziale e uscire presto dall'effetto. Verificare prima con `cd apps/web && bun test --preload ./happydom.ts -e "console.log(typeof window.matchMedia)"` oppure con un test temporaneo.

- [ ] **Step 5: Wire the route**

In `apps/web/src/routes/router.tsx`: import

```tsx
import { SpeseFrequenti } from '../statistiche/SpeseFrequenti';
```

route

```tsx
  const speseFrequentiRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/statistiche/spese-frequenti',
    beforeLoad: requireAuth(queryClient),
    component: SpeseFrequenti,
  });
```

e aggiunta in `addChildren`, subito dopo `statisticheRoute`.

- [ ] **Step 6: Full gate + build**

Run:
```bash
cd apps/web && bun test --preload ./happydom.ts && bun run build
cd ../.. && bun run typecheck && bun run lint
```

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/statistiche/useMediaQuery.ts apps/web/src/statistiche/SpeseFrequenti.tsx \
        apps/web/src/styles.css apps/web/src/routes/router.tsx apps/web/test/SpeseFrequenti.test.tsx
git commit -m "feat(web): 'Spese frequenti' pie screen at /statistiche/spese-frequenti"
```

---

## Task 7: Dropdown "Statistiche" nella navbar

**Files:**
- Modify: `apps/web/src/layout/Layout.tsx`
- Test: `apps/web/test/Layout.test.tsx` (estende i test esistenti)

**Interfaces:**
- Consumes: `Link` da `@tanstack/react-router`, `useMe` da `../auth/useAuth` (già usati), `FaChartPie` da `react-icons/fa6`.
- Produces: nessuna nuova export; il dropdown è interno a `Layout`.

Voci, **verbatim e in quest'ordine**: `Spese medie` (→ `/statistiche`), divisore, `Spese frequenti` (→ `/statistiche/spese-frequenti`), `Spesa` (→ `/statistiche/spesa`), `Carburante` (→ `/statistiche/carburante`), `Bollette` (→ `/statistiche/bolletta`), `Casa` (→ `/statistiche/casa`).

> Nota: l'etichetta è **"Bollette"** ma la route è `/statistiche/bolletta` (singolare) — è così nel legacy, non è un refuso da correggere.

- [ ] **Step 1: Write the failing test**

Aggiungere in coda a `apps/web/test/Layout.test.tsx`:

```tsx
test('hides the Statistiche menu when logged out', () => {
  renderLayout();
  expect(screen.queryByRole('button', { name: /statistiche/i })).toBeNull();
});

test('opens the Statistiche menu with the six legacy entries', () => {
  renderLayout({ id: 1 });
  const toggle = screen.getByRole('button', { name: /statistiche/i });
  fireEvent.click(toggle);
  for (const voce of [
    'Spese medie',
    'Spese frequenti',
    'Spesa',
    'Carburante',
    'Bollette',
    'Casa',
  ]) {
    expect(screen.getByText(voce)).toBeDefined();
  }
});
```

Aggiungere `fireEvent` all'import da `@testing-library/react` in cima al file.

> Il mock di `@tanstack/react-router` già presente in quel file rende `Link` come `<span>{children}</span>`: le voci sono quindi asseribili per testo. **Non toccare quel mock** — è la configurazione che ha risolto il fallimento CI di 4a.
>
> Attenzione a `getByText('Spesa')`: `getByText` fa match sul testo *completo* del nodo, quindi non collide con "Spese medie" né con "Spese frequenti". Se dovesse collidere, restringere con `{ exact: true }` o cercare dentro il `.dropdown-menu`.

- [ ] **Step 2: Run and confirm it fails**

Run: `cd apps/web && bun test --preload ./happydom.ts test/Layout.test.tsx`
Expected: FAIL — nessun bottone "Statistiche".

- [ ] **Step 3: Write the implementation**

In `apps/web/src/layout/Layout.tsx`:

aggiungere agli import

```tsx
import { useState } from 'react';
import { FaChartPie } from 'react-icons/fa6';
```

e, sopra il componente, la tabella delle voci

```tsx
// Legacy header dropdown. Note "Bollette" (plural label) points at the singular
// /statistiche/bolletta route — that mismatch exists in the original too.
const STAT_LINKS = [
  { to: '/statistiche', label: 'Spese medie' },
  { to: '/statistiche/spese-frequenti', label: 'Spese frequenti' },
  { to: '/statistiche/spesa', label: 'Spesa' },
  { to: '/statistiche/carburante', label: 'Carburante' },
  { to: '/statistiche/bolletta', label: 'Bollette' },
  { to: '/statistiche/casa', label: 'Casa' },
] as const;
```

dentro `Layout`, accanto agli altri hook

```tsx
  const [statsOpen, setStatsOpen] = useState(false);
```

e, nel markup, subito **dopo** il `<Link className="navbar-brand">` e **prima** del `<div className="ms-auto d-flex gap-2">`:

```tsx
        {me.data ? (
          <ul className="navbar-nav">
            <li className="nav-item dropdown">
              <button
                type="button"
                className="nav-link dropdown-toggle btn btn-link text-white"
                aria-expanded={statsOpen}
                onClick={() => setStatsOpen((open) => !open)}
              >
                <FaChartPie className="me-2" />
                Statistiche
              </button>
              <ul className={`dropdown-menu${statsOpen ? ' show' : ''}`}>
                {STAT_LINKS.map((l, i) => (
                  <li key={l.to}>
                    {i === 1 ? <hr className="dropdown-divider" /> : null}
                    <Link className="dropdown-item" to={l.to} onClick={() => setStatsOpen(false)}>
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </li>
          </ul>
        ) : null}
```

Il dropdown è scritto con markup Bootstrap e `useState` invece che con `NavDropdown` di `react-bootstrap`: la navbar esistente è già markup a mano, e `NavDropdown` monta Popper, che sotto happy-dom rende il test fragile.

- [ ] **Step 4: Run and confirm it passes**

Run: `cd apps/web && bun test --preload ./happydom.ts test/Layout.test.tsx`
Expected: PASS, 4 test (2 preesistenti + 2 nuovi).

- [ ] **Step 5: Full gate + build**

Run:
```bash
cd apps/web && bun test --preload ./happydom.ts && bun run build
cd ../.. && bun run typecheck && bun run lint
```

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/layout/Layout.tsx apps/web/test/Layout.test.tsx
git commit -m "feat(web): Statistiche dropdown in the navbar"
```

---

## Verifica finale (prima della PR)

- [ ] **Suite completa e gate**

```bash
cd apps/web && bun test --preload ./happydom.ts && bun run build
cd ../.. && bun run typecheck && bun run lint
```

- [ ] **Verifica manuale nel browser** (l'unica che copre il rendering reale dei grafici, invisibile ai test sotto happy-dom)

Terminale 1: `cd apps/api && bun run dev` — terminale 2: `cd apps/web && bun run dev`.
Login, poi percorrere tutte e sei le voci del menù verificando: le 4 tabelle di "Spese medie"; la torta con legenda e tooltip in euro; i 4 schermi a barre in entrambe le modalità (Mensile → etichette tipo "luglio 2026" e scroll lungo; Annuale → una schermata); nessun errore in console.

- [ ] **Push e apertura PR**

```bash
git push -u origin feat/phase4c-statistiche
gh pr create --base master --title "Fase 4c — Statistiche" --body "<riepilogo>"
```

---

## Self-review del piano

**Copertura della spec** — §2 superficie legacy → T4/T5/T6 (6 route) · §3 struttura file → tabella File Structure, tutti i file coperti · §4 trasformazioni → T1 · §5 stato intervallo (`useState`, etichette diverse per schermo) → T3 (`options` parametriche) + T5/T6 (etichette) · §6 grafici (Recharts, palette, `useMediaQuery`) → T5/T6 · §7 navigazione → T7 · §8 testing (cache pre-popolata, niente `mock.module`, niente asserzioni sull'SVG, solo suite web) → Global Constraints + ogni task · §9 fuori scope → nessun task, corretto · §10 rischi → il rischio bundler è verificato in T5 Step 1, quello data-corrente in T1 (`now` iniettabile).

**Coerenza dei tipi** — `StatisticaKind` definito in T2 e usato in T4/T5 · `IntervalOption` definito in T3 e importato in T5/T6 · `IntervalValue` da `@gc/shared-types` ovunque · `mediaMensile(rows, now?)` con la stessa firma in T1/T4/T6 · `MediaTable({ titolo, sottotitolo?, rows })` coerente fra T3, T4 e T6 · chiavi di query identiche fra `queries.ts` (T2) e i `setQueryData` dei test (T4/T5/T6).
