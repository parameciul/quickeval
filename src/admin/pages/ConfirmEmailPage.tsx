import { useMutation } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link, useLocation } from 'react-router';
import { MAX_PASSWORD_LENGTH } from '../../../shared/accounts.ts';
import { useApi } from '../ApiContext.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';

// /confirma-email#<token>: the link from the email of a new account. Shown
// without a login. It confirms only with the password chosen at the sign-up:
// mail programs open links to check them, and someone who asked for an
// account with another person's email cannot get that person to confirm it.
export function ConfirmEmailPage() {
  const api = useApi();
  const token = useLocation().hash.replace(/^#/, '');
  const [password, setPassword] = useState('');
  const confirm = useMutation({ mutationFn: () => api.confirmEmail(token, password) });

  return (
    <section className="login-box">
      <h1>Confirmă adresa de email</h1>
      {confirm.isSuccess ? (
        <div className="warning" role="status">
          <p>Gata: adresa ta este confirmată.</p>
          <p>Acum un administrator trebuie să aprobe contul. Vei primi un email după aprobare.</p>
        </div>
      ) : token === '' ? (
        <p>Linkul nu este întreg. Deschide-l din nou din email.</p>
      ) : (
        <form
          className="form-stack"
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            confirm.mutate();
          }}
        >
          <p>Ai cerut un cont în QuickEval. Scrie parola aleasă atunci, ca să confirmi că adresa de email este a ta.</p>
          <label htmlFor="confirm-password">Parola</label>
          <input
            id="confirm-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            maxLength={MAX_PASSWORD_LENGTH}
            required
          />
          <span>
            <button type="submit" className="button" disabled={confirm.isPending}>
              {confirm.isPending ? 'Se confirmă…' : 'Confirmă adresa'}
            </button>
          </span>
          {confirm.error && <ErrorMessage error={confirm.error} />}
        </form>
      )}
      <p className="hint">
        <Link to="/">Înapoi la pagina de intrare</Link>
      </p>
    </section>
  );
}
