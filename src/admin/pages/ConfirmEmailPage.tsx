import { useMutation } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { useLocation } from 'react-router';
import { MAX_PASSWORD_LENGTH } from '../../../shared/accounts.ts';
import { useApi } from '../ApiContext.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';
import { BackHome, State, useStateHeading, WayIn } from '../wayIn/WayIn.tsx';

// /confirma-email#<token>: the link from the email of a new account. Shown
// without a login. It confirms only with the password chosen at the sign-up:
// mail programs open links to check them, and someone who asked for an
// account with another person's email cannot get that person to confirm it.
export function ConfirmEmailPage() {
  const api = useApi();
  const token = useLocation().hash.replace(/^#/, '');
  const [password, setPassword] = useState('');
  const confirm = useMutation({ mutationFn: () => api.confirmEmail(token, password) });
  const heading = useStateHeading(confirm.isSuccess ? 'done' : 'form');

  return (
    <WayIn>
      {confirm.isSuccess ? (
        <State heading={heading} icon="done" title="Adresa ta este confirmată">
          <div role="status">
            <p>Acum un administrator trebuie să aprobe contul. Vei primi un email după aprobare.</p>
          </div>
          <BackHome />
        </State>
      ) : (
        <State heading={heading} title="Confirmă adresa de email">
          {token === '' ? (
            <p>Linkul nu este întreg. Deschide-l din nou din email.</p>
          ) : (
            <form
              className="form-fields"
              onSubmit={(event: FormEvent) => {
                event.preventDefault();
                confirm.mutate();
              }}
            >
              <p>Ai cerut un cont în MQGrader. Scrie parola aleasă atunci, ca să confirmi că adresa de email este a ta.</p>
              <div className="form-field">
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
              </div>
              <button type="submit" className="button way-in-wide" disabled={confirm.isPending}>
                {confirm.isPending ? 'Se confirmă…' : 'Confirmă adresa'}
              </button>
              {confirm.error && <ErrorMessage error={confirm.error} />}
            </form>
          )}
          <BackHome />
        </State>
      )}
    </WayIn>
  );
}

