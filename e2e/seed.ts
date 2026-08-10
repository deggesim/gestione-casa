import { SQL } from 'bun';
// Relative, not '@gc/shared-types': the install is isolated, so workspace packages are
// linked only inside apps/*/node_modules — a bare specifier does not resolve from here.
import { CSRF_HEADER, CSRF_VALUE } from '../packages/shared-types/src/csrf';

export const E2E_USER = { email: 'e2e@example.it', password: 'segretissima' };

// Same shape the app uses: process env wins over apps/api/.env, so the caller decides
// which database this touches. The e2e script sets it; nothing here defaults it.
const url = process.env.DATABASE_URL;
if (!url) throw new Error('Missing DATABASE_URL — run via `bun run e2e`');

const ymd = (d: Date) => d.toISOString().slice(0, 10);
const daysAgo = (n: number) => ymd(new Date(Date.now() - n * 86_400_000));

// Dates are RELATIVE to today because every statistiche screen defaults to "Ultimo mese":
// fixed dates in the past render an empty chart, and an assertion on an empty chart passes
// for the wrong reason. Repeated descriptions (pane, benzina) give the pie something to
// group by; the two rows past a year feed the "Ultimo anno" interval.
const rows: readonly [string, string, number, number][] = [
  [daysAgo(1), 'spesa settimanale', 100, 1],
  [daysAgo(3), 'spesa settimanale', 120, 1],
  [daysAgo(5), 'pane', 8, 1],
  [daysAgo(6), 'pane', 9, 1],
  [daysAgo(7), 'latte', 3, 1],
  [daysAgo(2), 'benzina', 60, 2],
  [daysAgo(9), 'benzina', 55, 2],
  [daysAgo(4), 'luce', 40, 3],
  [daysAgo(40), 'gas', 45, 3],
  [daysAgo(8), 'affitto', 500, 7],
  [daysAgo(400), 'affitto', 480, 7],
];

export const seedDb = async () => {
  const sql = new SQL(url);
  try {
    // Guard, not hygiene: in Fase 4b a test runner pointed at the dev database and
    // TRUNCATEd it. A real database has thousands of rows; a test one has none.
    const [row] = await sql`SELECT count(*)::int AS n FROM gc.andamento`;
    const n = row?.n ?? 0;
    if (n > 100)
      throw new Error(`refusing to TRUNCATE: gc.andamento has ${n} rows, this is not a test DB`);

    await sql`TRUNCATE gc.token, gc.andamento, gc.utente, gc.tipo_spesa RESTART IDENTITY CASCADE`;
    await sql`INSERT INTO gc.tipo_spesa (id, descrizione) VALUES
      (1,'spesa'),(2,'carburante'),(3,'bolletta'),(7,'casa')`;
    for (const [giorno, descrizione, costo, tipo] of rows)
      await sql`INSERT INTO gc.andamento (giorno, descrizione, costo, tipo_spesa_id)
        VALUES (${giorno}, ${descrizione}, ${costo}, ${tipo})`;
  } finally {
    await sql.close();
  }
};

// Goes through the public endpoint so the password hash is produced by the app itself,
// which means the login flow validates against a real hash. Needs the API already up.
export const seedUtente = async (apiUrl: string) => {
  const res = await fetch(`${apiUrl}/utente`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', [CSRF_HEADER]: CSRF_VALUE },
    body: JSON.stringify(E2E_USER),
  });
  if (!res.ok) throw new Error(`seedUtente failed: ${res.status} ${await res.text()}`);
};
