import type { Andamento } from '@gc/shared-types';

export type FormValues = {
  id?: number | null;
  giorno: string; // YYYY-MM-DD (matches <input type="date">)
  descrizione: string;
  costo: number | '';
  tipoSpesaId: number | '';
};

// Local calendar date as YYYY-MM-DD (avoids UTC shift from toISOString()).
export const today = (): string => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

export const emptyForm = (): FormValues => ({
  giorno: today(),
  descrizione: '',
  costo: '',
  tipoSpesaId: '',
});

export const prefillForm = (p: { descrizione: string; tipoSpesaId: number }): FormValues => ({
  giorno: today(),
  descrizione: p.descrizione,
  costo: '',
  tipoSpesaId: p.tipoSpesaId,
});

export const formFromAndamento = (a: Andamento): FormValues => ({
  id: a.id,
  giorno: a.giorno,
  descrizione: a.descrizione,
  costo: a.costo,
  tipoSpesaId: a.tipoSpesa.id,
});

export const cloneForm = (a: Andamento): FormValues => ({
  giorno: today(),
  descrizione: a.descrizione,
  costo: a.costo,
  tipoSpesaId: a.tipoSpesa.id,
});

// Legacy quick-add presets (descriptions + category IDs are verbatim-legacy).
export const PREFILLS = {
  spesa: { titolo: 'Spesa', descrizione: 'Spesa', tipoSpesaId: 1 },
  carburante: { titolo: 'Carburante', descrizione: 'Gasolio Fiesta', tipoSpesaId: 2 },
  pulizie: { titolo: 'Pulizie casa', descrizione: 'Michela pulizie', tipoSpesaId: 7 },
} as const;
