import { Elysia, t } from 'elysia';
import { TipoSpesaSchema } from '@gc/shared-types';
import { db } from '../db/client';
import { authPlugin } from '../auth/auth.plugin';
import { createTipoSpesaRepository } from './tipo-spesa.repository';
import { createTipoSpesaService } from './tipo-spesa.service';

const service = createTipoSpesaService(createTipoSpesaRepository(db));

export const tipoSpesaRoutes = new Elysia({ prefix: '/tipo-spesa' })
  .use(authPlugin)
  .get('/', () => service.findAll(), { response: t.Array(TipoSpesaSchema) })
  .get('/:id', ({ params }) => service.findById(params.id), {
    params: t.Object({ id: t.Number() }),
    response: TipoSpesaSchema,
  });
