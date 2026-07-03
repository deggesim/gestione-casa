import { BadRequestError, NotFoundError } from '../errors';
import type { AndamentoInput } from '@gc/shared-types';
import type { createAndamentoRepository } from './andamento.repository';

export const createAndamentoService = (repo: ReturnType<typeof createAndamentoRepository>) => ({
  findAll: () => repo.findAll(),
  findById: async (id: number) => {
    const found = await repo.findById(id);
    if (!found) throw new NotFoundError(`Andamento ${id} not found`);
    return found;
  },
  save: async (input: AndamentoInput) => {
    if (!(await repo.tipoSpesaExists(input.tipoSpesa.id)))
      throw new BadRequestError(`TipoSpesa ${input.tipoSpesa.id} not found`);
    const id = await repo.insert(input);
    return (await repo.findById(id))!; // just inserted → guaranteed present
  },
  update: async (input: AndamentoInput) => {
    if (input.id == null || !(await repo.findById(input.id)))
      throw new BadRequestError(`Andamento ${input.id} not found`);
    if (!(await repo.tipoSpesaExists(input.tipoSpesa.id)))
      throw new BadRequestError(`TipoSpesa ${input.tipoSpesa.id} not found`);
    await repo.update(input);
    return (await repo.findById(input.id))!; // just updated → guaranteed present
  },
  remove: async (id: number) => {
    if ((await repo.remove(id)) === 0) throw new NotFoundError(`Andamento ${id} not found`);
    return { deleted: id };
  },
});
