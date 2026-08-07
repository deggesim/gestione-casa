import { test, expect } from 'bun:test';
import { render, screen, fireEvent } from '@testing-library/react';
import { IntervalRadio } from '../src/statistiche/IntervalRadio';

const options = [
  { value: 'M' as const, label: 'Mensile' },
  { value: 'Y' as const, label: 'Annuale' },
];

test('renders the legend and one radio per option, with the current one checked', () => {
  render(<IntervalRadio legend="Frequenza" options={options} value="Y" onChange={() => {}} />);
  expect(screen.getByText('Frequenza')).toBeDefined();
  expect((screen.getByLabelText('Mensile') as HTMLInputElement).checked).toBe(false);
  expect((screen.getByLabelText('Annuale') as HTMLInputElement).checked).toBe(true);
});

test('calls onChange with the clicked value', () => {
  let picked = '';
  render(
    <IntervalRadio legend="Frequenza" options={options} value="M" onChange={(v) => (picked = v)} />,
  );
  fireEvent.click(screen.getByLabelText('Annuale'));
  expect(picked).toBe('Y');
});
