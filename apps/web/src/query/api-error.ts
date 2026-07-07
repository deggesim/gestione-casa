type Msg = { title: string; message: string };

const MAP: Record<number, Msg> = {
  401: { title: 'Utente non loggato', message: "L'utente non è loggato o la sessione è scaduta" },
  403: {
    title: 'Utente non autorizzato',
    message: "L'utente non è autorizzato ad eseguire l'operazione richiesta",
  },
  400: { title: 'Errore nella richiesta', message: 'I dati inseriti sono errati' },
  422: { title: 'Errori nella validazione', message: 'Si è verificato un errore imprevisto' },
  500: { title: 'Errore server', message: 'Si è verificato un errore imprevisto' },
};

const GENERIC: Msg = {
  title: 'Problema generico',
  message: 'Si è verificato un errore imprevisto',
};

// Mirrors the Angular SharedService.notifyError mapping. `body` (server error text),
// when present, overrides the default message (matches the original 422 behavior).
export const apiErrorMessage = (status: number, body?: string): Msg => {
  const base = MAP[status] ?? GENERIC;
  return body ? { title: base.title, message: body } : base;
};
