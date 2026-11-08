import { useMutation, useQuery } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import type { Teacher } from '../../../shared/api.ts';
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from '../../../shared/accounts.ts';
import { DemoMeters, demoLine, demoUsage } from '../account/DemoMeters.tsx';
import { useApi } from '../ApiContext.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';
import { initials } from '../shell/initials.ts';
import { useLogout } from '../shell/useLogout.ts';

// The tag of the account: its kind, or the administrator.
export function accountTag(teacher: Teacher): string {
  if (teacher.role === 'admin') return 'Administrator';
  return teacher.demo ? 'Cont demo' : 'Cont complet';
}

// /cont (redesign spec §11.5): one column of three cards: who is logged in and
// what the account has used, the password, and "Ieși din cont". No pay button:
// nothing is on sale.
export function AccountPage() {
  const api = useApi();
  const me = useQuery({ queryKey: ['me'], queryFn: () => api.me() });
  const logout = useLogout();

  return (
    <section className="account-page">
      <h1>Contul meu</h1>
      {me.data && <AccountCard teacher={me.data} />}
      <PasswordCard />
      <section className="class-card account-out" aria-label="Ieșire">
        <span>Ieși din cont pe acest dispozitiv.</span>
        <button type="button" className="button-quiet" disabled={logout.isPending} onClick={() => logout.mutate()}>
          Ieși din cont
        </button>
        {logout.error && <ErrorMessage error={logout.error} />}
      </section>
    </section>
  );
}

function AccountCard({ teacher }: { teacher: Teacher }) {
  const demo = teacher.demo;
  const usage = demoUsage(teacher);
  return (
    <section className="class-card" aria-labelledby="account-card">
      <div className="class-card-head">
        <h2 id="account-card">Contul tău</h2>
        <span className={demo ? 'tag' : 'tag tag-ok'}>{accountTag(teacher)}</span>
      </div>
      <div className="account-body">
        <div className="account-who">
          <span className="account-avatar" aria-hidden="true">
            {initials(teacher.name)}
          </span>
          <div>
            <b>{teacher.name}</b>
            <span>{teacher.email}</span>
          </div>
        </div>
        {demo ? (
          <>
            <DemoMeters usage={usage} />
            <p className={usage.papersLeft === 0 ? 'account-line' : 'account-line is-muted'}>{demoLine(usage)}</p>
          </>
        ) : (
          <>
            <dl className="account-counts">
              <dt>Teste corectate</dt>
              <dd>{teacher.testsEvaluated}</dd>
              <dt>Lucrări corectate</dt>
              <dd>{teacher.papersGraded}</dd>
            </dl>
            {teacher.role === 'admin' && (
              <p className="account-line is-muted">
                Conturile și robotul sunt în <Link to="/setari">Setări</Link>.
              </p>
            )}
          </>
        )}
      </div>
    </section>
  );
}

function PasswordCard() {
  const api = useApi();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const change = useMutation({
    mutationFn: () => api.changePassword(current, next),
    onSuccess: () => {
      setCurrent('');
      setNext('');
    },
  });

  return (
    <section className="class-card" aria-labelledby="password-card">
      <div className="class-card-head">
        <h2 id="password-card">Parola</h2>
      </div>
      <form
        className="account-body form-fields"
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          change.mutate();
        }}
      >
        <div className="form-field">
          <label htmlFor="current-password">Parola de acum</label>
          <input
            id="current-password"
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={(event) => setCurrent(event.target.value)}
            maxLength={MAX_PASSWORD_LENGTH}
            required
          />
        </div>
        <div className="form-field">
          <label htmlFor="new-password">
            Parola nouă <span className="form-hint">(cel puțin {MIN_PASSWORD_LENGTH} caractere)</span>
          </label>
          <input
            id="new-password"
            type="password"
            autoComplete="new-password"
            value={next}
            onChange={(event) => setNext(event.target.value)}
            minLength={MIN_PASSWORD_LENGTH}
            maxLength={MAX_PASSWORD_LENGTH}
            required
          />
        </div>
        <span>
          <button className="button-quiet" type="submit" disabled={change.isPending}>
            Schimbă parola
          </button>
        </span>
        {change.isSuccess && <p role="status">Parola a fost schimbată. Pe alte dispozitive intri din nou cu parola nouă.</p>}
        {change.error && <ErrorMessage error={change.error} />}
      </form>
    </section>
  );
}
