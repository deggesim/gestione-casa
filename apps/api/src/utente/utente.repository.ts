import { and, eq } from 'drizzle-orm';
import type { db as Db } from '../db/client';
import { utente, token } from '../db/schema';

export const createUtenteRepository = (db: typeof Db) => ({
  findByEmail: async (email: string) =>
    (await db.select().from(utente).where(eq(utente.email, email)))[0] ?? null,
  findById: async (id: number) =>
    (await db.select().from(utente).where(eq(utente.id, id)))[0] ?? null,
  create: async (email: string, passwordHash: string) =>
    (await db.insert(utente).values({ email, password: passwordHash }).returning())[0]!,
  update: async (id: number, fields: { email?: string; passwordHash?: string }) => {
    const set: { email?: string; password?: string } = {};
    if (fields.email !== undefined) set.email = fields.email;
    if (fields.passwordHash !== undefined) set.password = fields.passwordHash;
    if (Object.keys(set).length === 0) return;
    await db.update(utente).set(set).where(eq(utente.id, id));
  },
  remove: async (id: number) => {
    await db.delete(utente).where(eq(utente.id, id));
  },
  addToken: async (utenteId: number, value: string) => {
    await db.insert(token).values({ utenteId, token: value });
  },
  findToken: async (utenteId: number, value: string) =>
    (
      await db
        .select()
        .from(token)
        .where(and(eq(token.utenteId, utenteId), eq(token.token, value)))
    )[0] ?? null,
  removeToken: async (utenteId: number, value: string) => {
    await db.delete(token).where(and(eq(token.utenteId, utenteId), eq(token.token, value)));
  },
  removeAllTokens: async (utenteId: number) => {
    await db.delete(token).where(eq(token.utenteId, utenteId));
  },
});
