import { test, expect, mock } from 'bun:test';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AndamentoForm } from '../src/andamento/AndamentoForm';
import { emptyForm, formFromAndamento } from '../src/andamento/prefills';

const tipiSpesa = [
  { id: 1, descrizione: 'spesa' },
  { id: 2, descrizione: 'carburante' },
];

test('Salva is disabled until every required field is valid', async () => {
  render(
    <AndamentoForm
      titolo="Nuova voce di spesa"
      initial={emptyForm()}
      tipiSpesa={tipiSpesa}
      onSubmit={() => {}}
      onCancel={() => {}}
    />,
  );
  const salva = () => screen.getByRole('button', { name: 'Salva' }) as HTMLButtonElement;
  expect(salva().disabled).toBe(true);

  fireEvent.change(screen.getByLabelText(/descrizione/i), { target: { value: 'pane' } });
  fireEvent.change(screen.getByLabelText(/costo/i), { target: { value: '3.5' } });
  fireEvent.change(screen.getByLabelText(/tipo spesa/i), { target: { value: '1' } });
  // giorno is pre-filled by emptyForm(); all required fields now set
  await waitFor(() => expect(salva().disabled).toBe(false));
});

test('costo below 0.01 keeps the form invalid', async () => {
  render(
    <AndamentoForm
      titolo="x"
      initial={emptyForm()}
      tipiSpesa={tipiSpesa}
      onSubmit={() => {}}
      onCancel={() => {}}
    />,
  );
  fireEvent.change(screen.getByLabelText(/descrizione/i), { target: { value: 'p' } });
  fireEvent.change(screen.getByLabelText(/tipo spesa/i), { target: { value: '1' } });
  fireEvent.change(screen.getByLabelText(/costo/i), { target: { value: '0' } });
  const salva = () => screen.getByRole('button', { name: 'Salva' }) as HTMLButtonElement;
  await waitFor(async () => {
    await new Promise((r) => setTimeout(r, 0));
    expect(salva().disabled).toBe(true);
  });
});

test('whitespace-only descrizione keeps Salva enabled (gate matches RHF required, no trim)', async () => {
  render(
    <AndamentoForm
      titolo="x"
      initial={emptyForm()}
      tipiSpesa={tipiSpesa}
      onSubmit={() => {}}
      onCancel={() => {}}
    />,
  );
  fireEvent.change(screen.getByLabelText(/tipo spesa/i), { target: { value: '1' } });
  fireEvent.change(screen.getByLabelText(/costo/i), { target: { value: '3.5' } });
  fireEvent.change(screen.getByLabelText(/descrizione/i), { target: { value: ' ' } });
  // giorno is pre-filled by emptyForm(); RHF's `required` accepts ' ', so the gate must too
  const salva = () => screen.getByRole('button', { name: 'Salva' }) as HTMLButtonElement;
  await waitFor(() => expect(salva().disabled).toBe(false));
});

test('submit builds an AndamentoInput with tipoSpesa:{id}, numeric costo, and the id when editing', async () => {
  const onSubmit = mock((_input: unknown) => {});
  render(
    <AndamentoForm
      titolo="Modifica voce di spesa"
      initial={formFromAndamento({
        id: 3,
        giorno: '2025-01-10',
        descrizione: 'spesa gen',
        costo: 100,
        tipoSpesa: { id: 1, descrizione: 'spesa' },
      })}
      tipiSpesa={tipiSpesa}
      onSubmit={onSubmit}
      onCancel={() => {}}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Salva' }));
  await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
  expect(onSubmit).toHaveBeenCalledWith({
    id: 3,
    giorno: '2025-01-10',
    descrizione: 'spesa gen',
    costo: 100,
    tipoSpesa: { id: 1 },
  });
});
