import { test, expect } from 'bun:test';
import { crumbsFromMatches } from '../src/layout/breadcrumbs';

test('collects the chain declared by the matched routes', () => {
  expect(
    crumbsFromMatches([
      {},
      {
        staticData: { crumbs: [{ label: 'Spese medie', to: '/statistiche' }, { label: 'Spesa' }] },
      },
    ]),
  ).toEqual([{ label: 'Spese medie', to: '/statistiche' }, { label: 'Spesa' }]);
});

test('ignores matches without crumbs', () => {
  expect(crumbsFromMatches([{}, { staticData: {} }])).toEqual([]);
});

test('keeps a single-entry chain intact', () => {
  expect(crumbsFromMatches([{ staticData: { crumbs: [{ label: 'Home' }] } }])).toEqual([
    { label: 'Home' },
  ]);
});
