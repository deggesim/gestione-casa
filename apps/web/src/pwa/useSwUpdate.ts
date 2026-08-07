import { useEffect, useState } from 'react';
import { ENABLE_SW } from '../config';
import { watchForUpdate, type UpdatableRegistration, type WaitingWorker } from './update';

// Registers the worker (when enabled for this environment) and exposes the state the
// update prompt needs. Mirrors the legacy AppUpdateService + "Aggiornamento app
// disponibile" popup.
export const useSwUpdate = () => {
  const [waiting, setWaiting] = useState<WaitingWorker | null>(null);

  useEffect(() => {
    if (!ENABLE_SW || !('serviceWorker' in navigator)) return;

    let reloading = false;
    const onControllerChange = () => {
      // Guard against the reload loop: controllerchange also fires on first activation.
      if (reloading) return;
      reloading = true;
      location.reload();
    };
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);

    void navigator.serviceWorker.register('/sw.js').then((registration) => {
      watchForUpdate(
        // The DOM's overloaded addEventListener does not match the narrow structural type
        // above; the fakes in test/pwa-update.test.ts define the contract that matters.
        registration as unknown as UpdatableRegistration,
        navigator.serviceWorker.controller !== null,
        setWaiting,
      );
    });

    return () =>
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
  }, []);

  return {
    updateReady: waiting !== null,
    applyUpdate: () => waiting?.postMessage('SKIP_WAITING'),
    dismiss: () => setWaiting(null),
  };
};
