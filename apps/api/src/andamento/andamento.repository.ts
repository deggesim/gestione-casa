import { asc, count, desc, eq, ilike, or } from 'drizzle-orm';
import type { db as Db } from '../db/client';
import { andamento, tipoSpesa } from '../db/schema';
import type { Andamento, AndamentoInput, AndamentoPage } from '@gc/shared-types';

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

export type PageParams = {
  page: number;
  pageSize: number;
  q?: string;
  sort: 'giorno' | 'descrizione' | 'costo';
  dir: 'asc' | 'desc';
};

const SORT_COLUMNS = {
  giorno: andamento.giorno,
  descrizione: andamento.descrizione,
  costo: andamento.costo,
} as const;

// Legacy parity: the filter only kicks in past 2 chars and matches descrizione OR the
// category name. `%` and `_` are escaped so the user's text is matched literally.
const filterWhere = (q?: string) => {
  if (!q || q.length <= 2) return undefined;
  const pattern = `%${q.replace(/[\\%_]/g, '\\$&')}%`;
  return or(ilike(andamento.descrizione, pattern), ilike(tipoSpesa.descrizione, pattern));
};

export const createAndamentoRepository = (db: typeof Db) => ({
  findPage: async ({ page, pageSize, q, sort, dir }: PageParams): Promise<AndamentoPage> => {
    const where = filterWhere(q);
    const totalRows = await db
      .select({ total: count() })
      .from(andamento)
      .innerJoin(tipoSpesa, eq(andamento.tipoSpesaId, tipoSpesa.id))
      .where(where);
    const total = totalRows[0]!.total; // an aggregate without GROUP BY always yields one row
    const current = Math.min(page, Math.max(1, Math.ceil(total / pageSize)));
    // `id desc` as the final key makes the order total: without it, rows sharing a
    // giorno can swap places between two requests and show up on two pages (or none).
    const rows = await baseSelect(db)
      .where(where)
      .orderBy((dir === 'asc' ? asc : desc)(SORT_COLUMNS[sort]), desc(andamento.id))
      .limit(pageSize)
      .offset((current - 1) * pageSize);
    return { items: rows.map(toAndamento), total, page: current, pageSize };
  },
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
