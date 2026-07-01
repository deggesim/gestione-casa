import { AuthError, BadRequestError } from '../errors';
import type { createUtenteRepository } from './utente.repository';

type Jwt = { sign: (payload: { id: string }) => Promise<string> };

export const createUtenteService = (repo: ReturnType<typeof createUtenteRepository>, jwt: Jwt) => ({
  register: async (email: string, password: string) => {
    // Match the original server exactly: bcrypt, 8 rounds. (Bun.password.hash
    // defaults to argon2id; Bun.password.verify auto-detects legacy bcrypt hashes.)
    const hash = await Bun.password.hash(password, { algorithm: 'bcrypt', cost: 8 });
    const created = await repo.create(email, hash);
    return { id: created.id, email: created.email };
  },
  login: async (email: string, password: string) => {
    const found = await repo.findByEmail(email);
    if (!found || !(await Bun.password.verify(password, found.password)))
      throw new AuthError('Email o password errate');
    const token = await jwt.sign({ id: String(found.id) });
    await repo.addToken(found.id, token);
    return { utente: { id: found.id, email: found.email }, token };
  },
  me: async (id: number) => {
    const found = await repo.findById(id);
    if (!found) throw new AuthError('Utente non trovato');
    return { id: found.id, email: found.email };
  },
  update: async (id: number, password: string) => {
    if (!password) throw new BadRequestError('Password richiesta');
    await repo.updatePassword(
      id,
      await Bun.password.hash(password, { algorithm: 'bcrypt', cost: 8 }),
    );
    const found = await repo.findById(id);
    return { id: found!.id, email: found!.email };
  },
  logout: (id: number, token: string) => repo.removeToken(id, token),
  logoutAll: (id: number) => repo.removeAllTokens(id),
  remove: (id: number) => repo.remove(id),
});
