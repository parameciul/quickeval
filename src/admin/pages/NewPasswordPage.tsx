import { useMutation } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from '../../../shared/accounts.ts';
import { useApi } from '../ApiContext.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';

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

  return (
    <section className="login-box">
      <h1>Parolă nouă</h1>
      {reset.isSuccess ? (
        <div className="warning" role="status">
          <p>Gata: parola a fost schimbată. Poți intra în cont cu ea.</p>
        </div>
      ) : token === '' ? (
        <p>Linkul nu este întreg. Deschide-l din nou din email.</p>
      ) : (
        <form
          className="form-stack"
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            reset.mutate();
          }}
        >
          <label htmlFor="new-password">Parola nouă (cel puțin {MIN_PASSWORD_LENGTH} caractere)</label>
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
          <span>
            <button type="submit" className="button" disabled={reset.isPending}>
              {reset.isPending ? 'Se salvează…' : 'Salvează parola'}
            </button>
          </span>
          {reset.error && <ErrorMessage error={reset.error} />}
        </form>
      )}
      <p className="hint">
        <Link to="/">Înapoi la pagina de intrare</Link>
      </p>
    </section>
  );
}
