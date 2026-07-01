import { sql } from 'drizzle-orm';
import { db } from '../src/db/client';

const ddl = sql`
  CREATE SCHEMA IF NOT EXISTS gc;
  CREATE TABLE IF NOT EXISTS gc.tipo_spesa (id serial PRIMARY KEY, descrizione text NOT NULL);
  CREATE TABLE IF NOT EXISTS gc.andamento (
    id serial PRIMARY KEY, giorno date NOT NULL, descrizione text NOT NULL,
    costo numeric(10,2) NOT NULL, tipo_spesa_id integer NOT NULL REFERENCES gc.tipo_spesa(id));
  CREATE TABLE IF NOT EXISTS gc.utente (id serial PRIMARY KEY, email text NOT NULL, password text NOT NULL);
  CREATE TABLE IF NOT EXISTS gc.token (
    id serial PRIMARY KEY, token text NOT NULL, utente_id integer NOT NULL REFERENCES gc.utente(id));
`;

export const resetDb = async () => {
  await db.execute(
    sql`TRUNCATE gc.token, gc.andamento, gc.utente, gc.tipo_spesa RESTART IDENTITY CASCADE`,
  );
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
