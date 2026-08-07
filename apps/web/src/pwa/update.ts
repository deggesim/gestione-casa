// Structural types, not the DOM's ServiceWorker*: happy-dom has no ServiceWorkerContainer,
// so this stays testable with plain fakes. The real registration satisfies these.
export type WaitingWorker = {
  state: string;
  postMessage: (message: string) => void;
  addEventListener: (type: 'statechange', cb: () => void) => void;
};

export type UpdatableRegistration = {
  waiting: WaitingWorker | null;
  installing: WaitingWorker | null;
  addEventListener: (type: 'updatefound', cb: () => void) => void;
};

// Calls onReady when a new worker is installed and waiting to take over. `hasController`
// distinguishes a real update from the very first install, which must not prompt: on a
// first visit there is no previous version to replace.
export const watchForUpdate = (
  registration: UpdatableRegistration,
  hasController: boolean,
  onReady: (waiting: WaitingWorker) => void,
) => {
  if (!hasController) return;
  if (registration.waiting) {
    onReady(registration.waiting);
    return;
  }
  registration.addEventListener('updatefound', () => {
    const installing = registration.installing;
    if (!installing) return;
    installing.addEventListener('statechange', () => {
      if (installing.state === 'installed') onReady(installing);
    });
  });
};
