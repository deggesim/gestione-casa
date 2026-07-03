import { desc, eq } from 'drizzle-orm';
import type { db as Db } from '../db/client';
import { andamento, tipoSpesa } from '../db/schema';
import type { Andamento, AndamentoInput } from '@gc/shared-types';

const toAndamento = (row: {
  id: number;
  giorno: string;
  descrizione: string;
  costo: string;
  tipoSpesaId: number;
  tsDescrizione: string;
}): Andamento => ({
  id: row.id,
  // bun-sql actually returns PG `date` columns as a Date (despite Drizzle's "string
  // mode" static type); Date(...) normalizes either shape into a real Date instance.
  giorno: new Date(row.giorno),
  descrizione: row.descrizione,
  costo: Number(row.costo),
  tipoSpesa: { id: row.tipoSpesaId, descrizione: row.tsDescrizione },
});

const baseSelect = (db: typeof Db) =>
  db
    .select({
      id: andamento.id,
      giorno: andamento.giorno,
      descrizione: andamento.descrizione,
      costo: andamento.costo,
      tipoSpesaId: andamento.tipoSpesaId,
      tsDescrizione: tipoSpesa.descrizione,
    })
    .from(andamento)
    .innerJoin(tipoSpesa, eq(andamento.tipoSpesaId, tipoSpesa.id));

export const createAndamentoRepository = (db: typeof Db) => ({
  findAll: async (): Promise<Andamento[]> =>
    (await baseSelect(db).orderBy(desc(andamento.giorno))).map(toAndamento),
  findById: async (id: number): Promise<Andamento | null> => {
    const rows = await baseSelect(db).where(eq(andamento.id, id));
    return rows[0] ? toAndamento(rows[0]) : null;
  },
  tipoSpesaExists: async (id: number): Promise<boolean> =>
    (await db.select({ id: tipoSpesa.id }).from(tipoSpesa).where(eq(tipoSpesa.id, id))).length > 0,
  insert: async (input: AndamentoInput): Promise<number> => {
    const rows = await db
      .insert(andamento)
      .values({
        giorno: input.giorno,
        descrizione: input.descrizione,
        costo: String(input.costo),
        tipoSpesaId: input.tipoSpesa.id,
      })
      .returning({ id: andamento.id });
    return rows[0]!.id;
  },
  update: async (input: AndamentoInput): Promise<void> => {
    await db
      .update(andamento)
      .set({
        giorno: input.giorno,
        descrizione: input.descrizione,
        costo: String(input.costo),
        tipoSpesaId: input.tipoSpesa.id,
      })
      .where(eq(andamento.id, input.id!));
  },
  remove: async (id: number): Promise<number> => {
    const rows = await db
      .delete(andamento)
      .where(eq(andamento.id, id))
      .returning({ id: andamento.id });
    return rows.length;
  },
});
