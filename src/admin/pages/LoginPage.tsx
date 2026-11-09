import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { useLocation } from 'react-router';
import { DEMO_PAPER_LIMIT, MAX_PASSWORD_LENGTH, MAX_TEACHER_NAME_LENGTH, MIN_PASSWORD_LENGTH, normalizeEmail } from '../../../shared/accounts.ts';
import { countLabel } from '../../ui/format.ts';
import { useApi } from '../ApiContext.tsx';
import { ApiError } from '../api.ts';
import { ErrorMessage } from '../ErrorMessage.tsx';
import { State, useStateHeading, WayIn } from '../wayIn/WayIn.tsx';

// What the left half shows: a form, or what happened after one. "pending" is
// an account that confirmed its email and waits for an administrator: its
// login is refused, so it has no session.
type Mode =
  | { name: 'login' }
  | { name: 'signup' }
  | { name: 'forgot' }
  | { name: 'signup-sent' }
  | { name: 'forgot-sent' }
  | { name: 'pending'; email: string };

// The link "Cere un cont de profesor" of the landing page opens /teacher/#cont-nou.
export const SIGNUP_HASH = '#cont-nou';

// Shown instead of every page while nobody is logged in (redesign spec §11.4):
// "Intră în cont", "Cont nou de profesor", "Am uitat parola", and the state
// after each. A new state moves the focus to its heading.
export function LoginPage() {
  const { hash } = useLocation();
  const [mode, setMode] = useState<Mode>(hash === SIGNUP_HASH ? { name: 'signup' } : { name: 'login' });
  const heading = useStateHeading(mode.name);

  return (
    <WayIn>
      {mode.name === 'login' ? (
        <State heading={heading} title="Intră în cont" lead="Bine ai revenit.">
          <LoginForm onForgot={() => setMode({ name: 'forgot' })} onPending={(email) => setMode({ name: 'pending', email })} />
          <p className="way-in-alt">
            Nu ai cont?{' '}
            <button type="button" className="link-button" onClick={() => setMode({ name: 'signup' })}>
              Cere un cont de profesor
            </button>
          </p>
        </State>
      ) : mode.name === 'signup' ? (
        <State heading={heading} title="Cont nou de profesor" lead="Primești un cont demo, ca să încerci MQGrader cu o clasă a ta.">
          <SignupForm onSent={() => setMode({ name: 'signup-sent' })} />
          <p className="way-in-alt">
            Ai deja cont?{' '}
            <button type="button" className="link-button" onClick={() => setMode({ name: 'login' })}>
              Intră în cont
            </button>
          </p>
        </State>
      ) : mode.name === 'forgot' ? (
        <State heading={heading} title="Am uitat parola" lead="Scrie adresa de email a contului. Îți trimitem un link ca să alegi o parolă nouă.">
          <ForgotForm onSent={() => setMode({ name: 'forgot-sent' })} />
          <BackToLogin onClick={() => setMode({ name: 'login' })} />
        </State>
      ) : mode.name === 'signup-sent' ? (
        <State heading={heading} icon="mail" title="Verifică-ți emailul">
          <div role="status">
            <p>Ți-am trimis un email cu un link. Deschide-l în 24 de ore ca să confirmi adresa; apoi un administrator aprobă contul.</p>
            <p className="way-in-muted">
              După aprobare, intră cu emailul și parola alese. Nu găsești emailul? Uită-te și în Spam. Dacă ai deja un cont cu acest email,
              intră în el cu parola ta.
            </p>
          </div>
          <BackToLogin onClick={() => setMode({ name: 'login' })} />
        </State>
      ) : mode.name === 'forgot-sent' ? (
        <State heading={heading} icon="mail" title="Verifică-ți emailul">
          <div role="status">
            <p>Dacă adresa are un cont, ți-am trimis un email cu un link pentru o parolă nouă. Linkul merge o oră.</p>
            <p className="way-in-muted">Nu găsești emailul? Uită-te și în Spam, sau cere altul peste câteva minute.</p>
          </div>
          <BackToLogin onClick={() => setMode({ name: 'login' })} />
        </State>
      ) : (
        <State heading={heading} icon="wait" title="Contul tău așteaptă aprobarea">
          <div role="status">
            <p>
              Adresa <b>{mode.email}</b> este confirmată. Un administrator aprobă contul; vei primi un email după aprobare.
            </p>
          </div>
          <button type="button" className="button-quiet way-in-wide" onClick={() => setMode({ name: 'login' })}>
            Ieși
          </button>
        </State>
      )}
    </WayIn>
  );
}

function BackToLogin({ onClick }: { onClick: () => void }) {
  return (
    <p className="way-in-alt">
      <button type="button" className="link-button" onClick={onClick}>
        Înapoi la pagina de intrare
      </button>
    </p>
  );
}

function LoginForm({ onForgot, onPending }: { onForgot: () => void; onPending: (email: string) => void }) {
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
    // An account that waits for approval has its own state; any other refusal
    // (a wrong password, an email not yet confirmed) shows under the form.
    onError: (error) => {
      if (error instanceof ApiError && error.code === 'account_pending') onPending(normalizeEmail(email));
    },
  });
  const pending = login.error instanceof ApiError && login.error.code === 'account_pending';

  return (
    <form
      className="form-fields"
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        login.mutate();
      }}
    >
      <div className="form-field">
        <label htmlFor="login-email">Adresa de email</label>
        <input id="login-email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
      </div>
      <div className="form-field">
        <div className="way-in-label-row">
          <label htmlFor="login-password">Parola</label>
          <button type="button" className="link-button" onClick={onForgot}>
            Am uitat parola
          </button>
        </div>
        <input
          id="login-password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          maxLength={MAX_PASSWORD_LENGTH}
          required
        />
      </div>
      <button className="button way-in-wide" type="submit" disabled={login.isPending}>
        {login.isPending ? 'Se verifică…' : 'Intră'}
      </button>
      {login.error && !pending && <ErrorMessage error={login.error} />}
    </form>
  );
}

function ForgotForm({ onSent }: { onSent: () => void }) {
  const api = useApi();
  const [email, setEmail] = useState('');
  const forgot = useMutation({ mutationFn: () => api.forgotPassword(email), onSuccess: onSent });

  return (
    <form
      className="form-fields"
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        forgot.mutate();
      }}
    >
      <div className="form-field">
        <label htmlFor="forgot-email">Adresa de email</label>
        <input id="forgot-email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
      </div>
      <button className="button way-in-wide" type="submit" disabled={forgot.isPending}>
        {forgot.isPending ? 'Se trimite…' : 'Trimite linkul'}
      </button>
      {forgot.error && <ErrorMessage error={forgot.error} />}
    </form>
  );
}

function SignupForm({ onSent }: { onSent: () => void }) {
  const api = useApi();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const signup = useMutation({ mutationFn: () => api.signup({ name, email, password }), onSuccess: onSent });

  return (
    <>
      <form
        className="form-fields"
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          signup.mutate();
        }}
      >
        <div className="form-field">
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
        </div>
        <div className="form-field">
          <label htmlFor="signup-email">Adresa de email</label>
          <input id="signup-email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
        </div>
        <div className="form-field">
          <label htmlFor="signup-password">
            Parola <span className="form-hint">(cel puțin {MIN_PASSWORD_LENGTH} caractere)</span>
          </label>
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
        </div>
        <button className="button way-in-wide" type="submit" disabled={signup.isPending}>
          {signup.isPending ? 'Se trimite…' : 'Cere contul'}
        </button>
        {signup.error && <ErrorMessage error={signup.error} />}
      </form>
      <p className="way-in-note">
        <b>Contul demo:</b> poți corecta un test, cu cel mult {countLabel(DEMO_PAPER_LIMIT, 'lucrare', 'lucrări')}. Întâi confirmi adresa de email,
        apoi un administrator aprobă contul.
      </p>
    </>
  );
}
