import { ApiError, LoginExpiredError } from './api.ts';

// The Romanian text for a failed request. Only the API client's own errors
// carry Romanian text; any other error gets a generic message instead of the
// browser's English one.
export function errorText(error: unknown): string {
  return error instanceof ApiError || error instanceof LoginExpiredError ? error.message : 'A apărut o eroare. Încearcă din nou.';
}

// The API's answer when the login cookie is missing or has expired.
export function isLoginRequired(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401 && error.code === 'login_required';
}

// Shows the Romanian message of a failed request. An expired login also gets
// a button that reloads the page, which then shows the login form.
export function ErrorMessage({ error }: { error: unknown }) {
  return (
    <div className="alert" role="alert">
      <p className="alert-text">{errorText(error)}</p>
      {(error instanceof LoginExpiredError || isLoginRequired(error)) && (
        <button type="button" className="button-quiet button-small" onClick={() => window.location.reload()}>
          {isLoginRequired(error) ? 'Intră din nou' : 'Reîncarcă pagina'}
        </button>
      )}
    </div>
  );
}
