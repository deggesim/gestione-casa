import { type Static, Type } from '@sinclair/typebox';
import { TipoSpesaSchema } from './tipo-spesa';

export const AndamentoSchema = Type.Object({
  id: Type.Optional(Type.Union([Type.Number(), Type.Null()])),
  giorno: Type.String(), // ISO date (YYYY-MM-DD)
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
