import { useMutation } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from '../../../shared/accounts.ts';
import { useApi } from '../ApiContext.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';
import { BackHome, State, useStateHeading, WayIn } from '../wayIn/WayIn.tsx';

// /parola-noua#<token>: the link from the "Am uitat parola" email. Shown
// without a login. The token is after "#", so it never reaches a server log.
export function NewPasswordPage() {
  const api = useApi();
  const navigate = useNavigate();
  const location = useLocation();
  const token = location.hash.replace(/^#/, '');
  const [password, setPassword] = useState('');
  const reset = useMutation({
    mutationFn: () => api.setNewPassword(token, password),
    // The used link leaves the address bar and the history.
    onSuccess: () => navigate(location.pathname, { replace: true }),
  });
  const heading = useStateHeading(reset.isSuccess ? 'done' : 'form');

  return (
    <WayIn>
      {reset.isSuccess ? (
        <State heading={heading} icon="done" title="Parolă nouă">
          <div role="status">
            <p>Gata: parola a fost schimbată. Poți intra în cont cu ea.</p>
          </div>
          <BackHome />
        </State>
      ) : (
        <State heading={heading} title="Parolă nouă">
          {token === '' ? (
            <p>Linkul nu este întreg. Deschide-l din nou din email.</p>
          ) : (
            <form
              className="form-fields"
              onSubmit={(event: FormEvent) => {
                event.preventDefault();
                reset.mutate();
              }}
            >
              <div className="form-field">
                <label htmlFor="new-password">
                  Parola nouă <span className="form-hint">(cel puțin {MIN_PASSWORD_LENGTH} caractere)</span>
                </label>
                <input
                  id="new-password"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  minLength={MIN_PASSWORD_LENGTH}
                  maxLength={MAX_PASSWORD_LENGTH}
                  required
                />
              </div>
              <button type="submit" className="button way-in-wide" disabled={reset.isPending}>
                {reset.isPending ? 'Se salvează…' : 'Salvează parola'}
              </button>
              {reset.error && <ErrorMessage error={reset.error} />}
            </form>
          )}
          <BackHome />
        </State>
      )}
    </WayIn>
  );
}
