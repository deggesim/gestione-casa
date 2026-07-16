import { desc, eq } from 'drizzle-orm';
import type { db as Db } from '../db/client';
import { andamento, tipoSpesa } from '../db/schema';
import type { Andamento, AndamentoInput } from '@gc/shared-types';

// Normalize a PG `date` to the "YYYY-MM-DD" wire form. bun-sql hands it back as a JS Date
// or a string — and under `bun --watch` as a full ISO timestamp, because `instanceof Date`
// is unreliable across module realms (dev then serialized "...T00:00:00.000Z", breaking the
// web's formatGiorno). Switch on typeof, never `instanceof`, so every shape collapses to the
// date and the API contract (giorno = "YYYY-MM-DD") always holds.
export const toYmd = (giorno: string | Date): string =>
  typeof giorno === 'string' ? giorno.slice(0, 10) : giorno.toISOString().slice(0, 10);

const toAndamento = (row: {
  id: number;
  giorno: string | Date;
  descrizione: string;
  costo: string;
  tipoSpesaId: number;
  tsDescrizione: string;
}): Andamento => ({
  id: row.id,
  giorno: toYmd(row.giorno),
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
