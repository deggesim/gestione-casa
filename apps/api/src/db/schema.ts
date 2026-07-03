import { pgSchema, serial, integer, text, numeric, date } from 'drizzle-orm/pg-core';

export const gc = pgSchema('gc');

export const tipoSpesa = gc.table('tipo_spesa', {
  id: serial('id').primaryKey(),
  descrizione: text('descrizione').notNull(),
});

export const andamento = gc.table('andamento', {
  id: serial('id').primaryKey(),
  giorno: date('giorno').notNull(), // PG date; drizzle-orm/bun-sql returns a JS Date regardless of mode — normalized to "YYYY-MM-DD" in andamento.repository.ts
  descrizione: text('descrizione').notNull(),
  costo: numeric('costo', { precision: 10, scale: 2 }).notNull(), // returned as string by pg; coerced to number in andamento.repository.ts
  tipoSpesaId: integer('tipo_spesa_id')
    .notNull()
    .references(() => tipoSpesa.id),
});

export const utente = gc.table('utente', {
  id: serial('id').primaryKey(),
  email: text('email').notNull(),
  password: text('password').notNull(),
});

export const token = gc.table('token', {
  id: serial('id').primaryKey(),
  token: text('token').notNull(),
  utenteId: integer('utente_id')
    .notNull()
    .references(() => utente.id),
});
