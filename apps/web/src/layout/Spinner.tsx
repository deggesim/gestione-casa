import { useIsFetching, useIsMutating } from '@tanstack/react-query';

// Global overlay while any query/mutation is in flight (replaces the request-counter spinner).
export const Spinner = () => {
  const busy = useIsFetching() + useIsMutating() > 0;
  if (!busy) return null;
  return (
    <div className="loading-div">
      <div className="spinner-border text-primary" role="status" aria-label="Caricamento" />
    </div>
  );
};
