import { useMutation, useQuery } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import type { Teacher } from '../../../shared/api.ts';
import { DEMO_PAPER_LIMIT, MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from '../../../shared/accounts.ts';
import { countLabel } from '../../ui/format.ts';
import { useApi } from '../ApiContext.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';

// What kind of account this is, in one sentence.
export function accountKindText(teacher: Teacher): string {
  const counts = `${countLabel(teacher.testsEvaluated, 'test', 'teste')} și ${countLabel(teacher.papersGraded, 'lucrare', 'lucrări')}`;
  if (teacher.role === 'admin') return `Ești administrator. Până acum: ${counts}.`;
  if (!teacher.demo) return `Ai un cont complet. Până acum: ${counts}.`;
  return `Ai un cont demo: ai folosit ${Math.min(teacher.papersGraded + teacher.papersWaiting, DEMO_PAPER_LIMIT)} din ${DEMO_PAPER_LIMIT} lucrări.`;
}

// /cont: the teacher's own account: who is logged in, the password, and "Ieși".
export function AccountPage() {
  const api = useApi();
  const me = useQuery({ queryKey: ['me'], queryFn: () => api.me() });
  const logout = useMutation({
    mutationFn: () => api.logout(),
    // A new page load shows the login form.
    onSuccess: () => window.location.assign('/admin/'),
  });

  return (
    <section>
      <h1>Contul meu</h1>
      {me.data && (
        <>
          <p>
            {me.data.name} ({me.data.email})
          </p>
          <p>{accountKindText(me.data)}</p>
        </>
      )}
      <PasswordForm />
      <h2>Ieșire</h2>
      <button type="button" className="button-quiet" disabled={logout.isPending} onClick={() => logout.mutate()}>
        Ieși din cont
      </button>
      {logout.error && <ErrorMessage error={logout.error} />}
    </section>
  );
}

function PasswordForm() {
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
    <>
      <h2>Parola</h2>
      <form
        className="form-stack narrow"
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          change.mutate();
        }}
      >
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
        <label htmlFor="new-password">Parola nouă (cel puțin {MIN_PASSWORD_LENGTH} caractere)</label>
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
        <span>
          <button className="button" type="submit" disabled={change.isPending}>
            Schimbă parola
          </button>
        </span>
        {change.isSuccess && <p role="status">Parola a fost schimbată. Pe alte dispozitive intri din nou cu parola nouă.</p>}
        {change.error && <ErrorMessage error={change.error} />}
      </form>
    </>
  );
}
