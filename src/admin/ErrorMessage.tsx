import { LoginExpiredError } from './api.ts';

// Shows the Romanian message of a failed request. An expired login also gets
// a button that reloads the page, in case the automatic reload was skipped.
export function ErrorMessage({ error }: { error: unknown }) {
  const message = error instanceof Error ? error.message : 'A apărut o eroare. Încearcă din nou.';
  return (
    <div className="alert" role="alert">
      <p className="alert-text">{message}</p>
      {error instanceof LoginExpiredError && (
        <button type="button" className="button-quiet button-small" onClick={() => window.location.reload()}>
          Reîncarcă pagina
        </button>
      )}
    </div>
  );
}
