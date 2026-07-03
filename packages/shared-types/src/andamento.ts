import { type Static, Type } from '@sinclair/typebox';
import { TipoSpesaSchema } from './tipo-spesa';

export const AndamentoSchema = Type.Object({
  id: Type.Optional(Type.Union([Type.Number(), Type.Null()])),
  // bun-sql maps PG `date` columns to a real JS Date (despite drizzle's "string
  // mode" column builder); Type.Date() validates the handler's actual pre-serialization
  // return value, JSON.stringify still emits an ISO string on the wire either way.
  giorno: Type.Date(),
  descrizione: Type.String(),
  costo: Type.Number({ minimum: 0.01 }),
  tipoSpesa: TipoSpesaSchema,
});
export type Andamento = Static<typeof AndamentoSchema>;

// Body accepted on create/update (id optional, tipoSpesa may carry just an id).
export const AndamentoInputSchema = Type.Object({
  id: Type.Optional(Type.Union([Type.Number(), Type.Null()])),
  giorno: Type.String(),
  descrizione: Type.String(),
  costo: Type.Number({ minimum: 0.01 }),
  tipoSpesa: Type.Object({ id: Type.Number() }),
});
export type AndamentoInput = Static<typeof AndamentoInputSchema>;
