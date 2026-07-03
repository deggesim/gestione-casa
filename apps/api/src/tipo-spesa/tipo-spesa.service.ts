import { NotFoundError } from '../errors';
import type { createTipoSpesaRepository } from './tipo-spesa.repository';

export const createTipoSpesaService = (repo: ReturnType<typeof createTipoSpesaRepository>) => ({
  findAll: () => repo.findAll(),
  findById: async (id: number) => {
    const found = await repo.findById(id);
    if (!found) throw new NotFoundError(`TipoSpesa ${id} not found`);
    return found;
  },
});
