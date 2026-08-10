import { test, expect } from 'bun:test';
import { watchForUpdate } from '../src/pwa/update';

type Listener = () => void;

const fakeWorker = (state = 'installing') => {
  const listeners: Listener[] = [];
  return {
    worker: {
      state,
      postMessage: () => {},
      addEventListener: (_: 'statechange', cb: Listener) => {
        listeners.push(cb);
      },
    },
    setState(next: string) {
      this.worker.state = next;
      for (const cb of listeners) cb();
    },
  };
};

const fakeRegistration = (waiting: ReturnType<typeof fakeWorker>['worker'] | null = null) => {
  const listeners: Listener[] = [];
  return {
    registration: {
      waiting,
      installing: null as ReturnType<typeof fakeWorker>['worker'] | null,
      addEventListener: (_: 'updatefound', cb: Listener) => {
        listeners.push(cb);
      },
    },
    fireUpdateFound() {
      for (const cb of listeners) cb();
    },
  };
};

test('ignores the very first install (no controller yet)', () => {
  const { worker } = fakeWorker('installed');
  const { registration } = fakeRegistration(worker);
  let calls = 0;
  watchForUpdate(registration, false, () => calls++);
  expect(calls).toBe(0);
});

test('reports a worker that is already waiting', () => {
  const { worker } = fakeWorker('installed');
  const { registration } = fakeRegistration(worker);
  const seen: unknown[] = [];
  watchForUpdate(registration, true, (w) => seen.push(w));
  expect(seen).toEqual([worker]);
});

test('reports a worker that finishes installing later', () => {
  const { registration, fireUpdateFound } = fakeRegistration();
  const installing = fakeWorker();
  registration.installing = installing.worker;
  let calls = 0;
  watchForUpdate(registration, true, () => calls++);

  fireUpdateFound();
  expect(calls).toBe(0);
  installing.setState('installed');
  expect(calls).toBe(1);
});

test('does not report a worker that goes redundant', () => {
  const { registration, fireUpdateFound } = fakeRegistration();
  const installing = fakeWorker();
  registration.installing = installing.worker;
  let calls = 0;
  watchForUpdate(registration, true, () => calls++);

  fireUpdateFound();
  installing.setState('redundant');
  expect(calls).toBe(0);
});
