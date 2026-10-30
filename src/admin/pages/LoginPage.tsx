import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { DEMO_TEST_LIMIT, MAX_PASSWORD_LENGTH, MAX_TEACHER_NAME_LENGTH, MIN_PASSWORD_LENGTH } from '../../../shared/accounts.ts';
import { useApi } from '../ApiContext.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';

type Mode = 'login' | 'signup';

// Shown instead of every page while nobody is logged in: "Intră" with email
// and password, or "Cont nou", which asks an administrator for an account.
export function LoginPage() {
  const [mode, setMode] = useState<Mode>('login');
  return (
    <section className="login-box">
      <h1>{mode === 'login' ? 'Intră în cont' : 'Cont nou'}</h1>
      <div className="login-switch" role="group" aria-label="Alege">
        <button type="button" className="button-quiet" aria-pressed={mode === 'login'} onClick={() => setMode('login')}>
          Am cont
        </button>
        <button type="button" className="button-quiet" aria-pressed={mode === 'signup'} onClick={() => setMode('signup')}>
          Vreau cont nou
        </button>
      </div>
      {mode === 'login' ? <LoginForm /> : <SignupForm />}
    </section>
  );
}

function LoginForm() {
  const api = useApi();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const login = useMutation({
    mutationFn: () => api.login(email, password),
    // Every page reads its data again, now with the login.
    onSuccess: async (teacher) => {
      queryClient.setQueryData(['me'], teacher);
      await queryClient.invalidateQueries();
    },
  });

  return (
    <form
      className="form-stack"
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        login.mutate();
      }}
    >
      <label htmlFor="login-email">Email</label>
      <input id="login-email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
      <label htmlFor="login-password">Parola</label>
      <input
        id="login-password"
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        maxLength={MAX_PASSWORD_LENGTH}
        required
      />
      <span>
        <button className="button" type="submit" disabled={login.isPending}>
          {login.isPending ? 'Se verifică…' : 'Intră'}
        </button>
      </span>
      {login.error && <ErrorMessage error={login.error} />}
      <p className="hint">Ai uitat parola? Scrie unui administrator: îți dă o parolă nouă.</p>
    </form>
  );
}

function SignupForm() {
  const api = useApi();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const signup = useMutation({ mutationFn: () => api.signup({ name, email, password }) });

  if (signup.isSuccess) {
    return (
      <div className="warning" role="status">
        <p>Ți-am trimis un email cu un link. Deschide-l în 24 de ore ca să confirmi adresa; apoi un administrator aprobă contul.</p>
        <p>
          După aprobare, intră cu emailul și parola alese. Nu găsești emailul? Uită-te și în Spam. Dacă ai deja un cont cu acest email, intră
          în el cu parola ta.
        </p>
      </div>
    );
  }

  return (
    <form
      className="form-stack"
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        signup.mutate();
      }}
    >
      <label htmlFor="signup-name">Numele tău</label>
      <input
        id="signup-name"
        type="text"
        autoComplete="name"
        value={name}
        onChange={(event) => setName(event.target.value)}
        maxLength={MAX_TEACHER_NAME_LENGTH}
        required
      />
      <label htmlFor="signup-email">Email</label>
      <input id="signup-email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
      <label htmlFor="signup-password">Parola (cel puțin {MIN_PASSWORD_LENGTH} caractere)</label>
      <input
        id="signup-password"
        type="password"
        autoComplete="new-password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        minLength={MIN_PASSWORD_LENGTH}
        maxLength={MAX_PASSWORD_LENGTH}
        required
      />
      <span>
        <button className="button" type="submit" disabled={signup.isPending}>
          {signup.isPending ? 'Se trimite…' : 'Cere contul'}
        </button>
      </span>
      {signup.error && <ErrorMessage error={signup.error} />}
      <p className="hint">
        Un cont nou este un cont demo: poți trimite teste la corectare de {DEMO_TEST_LIMIT} ori. Contul se poate folosi după ce confirmi adresa de email și îl
        aprobă un administrator.
      </p>
    </form>
  );
}
