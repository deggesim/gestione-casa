import { pgSchema, serial, integer, text, numeric, date } from 'drizzle-orm/pg-core';

export const gc = pgSchema('gc');

export const tipoSpesa = gc.table('tipo_spesa', {
  id: serial('id').primaryKey(),
  descrizione: text('descrizione').notNull(),
});

export const andamento = gc.table('andamento', {
  id: serial('id').primaryKey(),
  giorno: date('giorno').notNull(), // string mode (YYYY-MM-DD)
  descrizione: text('descrizione').notNull(),
  costo: numeric('costo', { precision: 10, scale: 2 }).notNull(), // returned as string by pg; coerce in service
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
