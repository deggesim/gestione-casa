import { test, expect } from 'bun:test';
import {
  today,
  emptyForm,
  prefillForm,
  formFromAndamento,
  cloneForm,
  PREFILLS,
} from '../src/andamento/prefills';

test('today is a YYYY-MM-DD string', () => {
  expect(today()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
});

test('emptyForm defaults giorno to today and clears the rest', () => {
  const f = emptyForm();
  expect(f.giorno).toBe(today());
  expect(f.descrizione).toBe('');
  expect(f.costo).toBe('');
  expect(f.tipoSpesaId).toBe('');
  expect(f.id).toBeUndefined();
});

test('PREFILLS carry the legacy descriptions and category IDs', () => {
  expect(PREFILLS.spesa).toEqual({ titolo: 'Spesa', descrizione: 'Spesa', tipoSpesaId: 1 });
  expect(PREFILLS.carburante).toEqual({
    titolo: 'Carburante',
    descrizione: 'Gasolio Fiesta',
    tipoSpesaId: 2,
  });
  expect(PREFILLS.pulizie).toEqual({
    titolo: 'Pulizie casa',
    descrizione: 'Michela pulizie',
    tipoSpesaId: 7,
  });
});

test('prefillForm keeps today + prefilled descrizione/tipoSpesa, no id', () => {
  const f = prefillForm(PREFILLS.carburante);
  expect(f).toEqual({ giorno: today(), descrizione: 'Gasolio Fiesta', costo: '', tipoSpesaId: 2 });
});

const a = {
  id: 3,
  giorno: '2025-01-10',
  descrizione: 'spesa gen',
  costo: 100,
  tipoSpesa: { id: 1, descrizione: 'spesa' },
};

test('formFromAndamento maps every field incl. id', () => {
  expect(formFromAndamento(a)).toEqual({
    id: 3,
    giorno: '2025-01-10',
    descrizione: 'spesa gen',
    costo: 100,
    tipoSpesaId: 1,
  });
});

test('cloneForm drops the id and resets giorno to today', () => {
  const f = cloneForm(a);
  expect(f.id).toBeUndefined();
  expect(f.giorno).toBe(today());
  expect(f.descrizione).toBe('spesa gen');
  expect(f.costo).toBe(100);
  expect(f.tipoSpesaId).toBe(1);
});
