import { type Static, Type } from '@sinclair/typebox';

export const TipoSpesaSchema = Type.Object({
  id: Type.Number(),
  descrizione: Type.String(),
});
export type TipoSpesa = Static<typeof TipoSpesaSchema>;
