import { eq } from 'drizzle-orm';
import type { db as Db } from '../db/client';
import { utente, token } from '../db/schema';

export const createUtenteRepository = (db: typeof Db) => ({
  findByEmail: async (email: string) =>
    (await db.select().from(utente).where(eq(utente.email, email)))[0] ?? null,
  findById: async (id: number) =>
    (await db.select().from(utente).where(eq(utente.id, id)))[0] ?? null,
  create: async (email: string, passwordHash: string) =>
    (await db.insert(utente).values({ email, password: passwordHash }).returning())[0]!,
  updatePassword: async (id: number, passwordHash: string) => {
    await db.update(utente).set({ password: passwordHash }).where(eq(utente.id, id));
  },
  remove: async (id: number) => {
    await db.delete(utente).where(eq(utente.id, id));
  },
  addToken: async (utenteId: number, value: string) => {
    await db.insert(token).values({ utenteId, token: value });
  },
  removeToken: async (utenteId: number, value: string) => {
    await db.delete(token).where(eq(token.token, value));
  },
  removeAllTokens: async (utenteId: number) => {
    await db.delete(token).where(eq(token.utenteId, utenteId));
  },
});
