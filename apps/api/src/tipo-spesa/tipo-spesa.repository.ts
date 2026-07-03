import { eq } from 'drizzle-orm';
import type { db as Db } from '../db/client';
import { tipoSpesa } from '../db/schema';

export const createTipoSpesaRepository = (db: typeof Db) => ({
  findAll: () => db.select().from(tipoSpesa),
  findById: async (id: number) => {
    const rows = await db.select().from(tipoSpesa).where(eq(tipoSpesa.id, id));
    return rows[0] ?? null;
  },
});
