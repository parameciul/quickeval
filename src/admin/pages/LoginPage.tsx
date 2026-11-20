import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type FormEvent } from 'react';
import { useLocation } from 'react-router';
import { DEMO_PAPER_LIMIT, MAX_PASSWORD_LENGTH, MAX_TEACHER_NAME_LENGTH, MIN_PASSWORD_LENGTH, normalizeEmail } from '../../../shared/accounts.ts';
import { countLabel } from '../../ui/format.ts';
import { countVisitEvent, loadTeacherCounter, teacherCounterLoaded, visitTab } from '../../ui/visits.ts';
import { useApi } from '../ApiContext.tsx';
import { ApiError } from '../api.ts';
import { ErrorMessage } from '../ErrorMessage.tsx';
import { State, useStateHeading, WayIn } from '../wayIn/WayIn.tsx';
import { ActionIcon } from '../../ui/ActionIcon.tsx';
import { t } from '../../i18n/t.ts';

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

// The link "Cere un cont de profesor" of the landing page opens /teacher/#new-account.
export const SIGNUP_HASH = '#new-account';

// Shown instead of every page while nobody is logged in (redesign spec §11.4):
// "Intră în cont", "Cont nou de profesor", "Am uitat parola", and the state
// after each. A new state moves the focus to its heading. The login screen is
// the only teacher page the visit counter sees (docs/analytics.md).
export function LoginPage() {
  const { hash } = useLocation();
  const [mode, setMode] = useState<Mode>(hash === SIGNUP_HASH ? { name: 'signup' } : { name: 'login' });
  const heading = useStateHeading(mode.name);
  useEffect(() => loadTeacherCounter(), []);

  return (
    <WayIn>
      {mode.name === 'login' ? (
        <State heading={heading} title={t('Intră în cont')} lead={t('Bine ai revenit.')}>
          <LoginForm onForgot={() => setMode({ name: 'forgot' })} onPending={(email) => setMode({ name: 'pending', email })} />
          <p className="way-in-alt">
            {t('Nu ai cont?')}{' '}
            <button type="button" className="link-button" onClick={() => setMode({ name: 'signup' })}>
              {t('Cere un cont de profesor')}
            </button>
          </p>
        </State>
      ) : mode.name === 'signup' ? (
        <State heading={heading} title={t('Cont nou de profesor')} lead={t('Primești un cont demo, ca să încerci MQGrader cu o clasă a ta.')}>
          <SignupForm onSent={() => setMode({ name: 'signup-sent' })} />
          <p className="way-in-alt">
            {t('Ai deja cont?')}{' '}
            <button type="button" className="link-button" onClick={() => setMode({ name: 'login' })}>
              {t('Intră în cont')}
            </button>
          </p>
        </State>
      ) : mode.name === 'forgot' ? (
        <State heading={heading} title={t('Am uitat parola')} lead={t('Scrie adresa de email a contului. Îți trimitem un link ca să alegi o parolă nouă.')}>
          <ForgotForm onSent={() => setMode({ name: 'forgot-sent' })} />
          <BackToLogin onClick={() => setMode({ name: 'login' })} />
        </State>
      ) : mode.name === 'signup-sent' ? (
        <State heading={heading} icon="mail" title={t('Verifică-ți emailul')}>
          <div role="status">
            <p>{t('Ți-am trimis un email cu un link. Deschide-l în 24 de ore ca să confirmi adresa; apoi un administrator aprobă contul.')}</p>
            <p className="way-in-muted">
              {t('După aprobare, intră cu emailul și parola alese. Nu găsești emailul? Uită-te și în Spam. Dacă ai deja un cont cu acest email, intră în el cu parola ta.')}
            </p>
          </div>
          <BackToLogin onClick={() => setMode({ name: 'login' })} />
        </State>
      ) : mode.name === 'forgot-sent' ? (
        <State heading={heading} icon="mail" title={t('Verifică-ți emailul')}>
          <div role="status">
            <p>{t('Dacă adresa are un cont, ți-am trimis un email cu un link pentru o parolă nouă. Linkul merge o oră.')}</p>
            <p className="way-in-muted">{t('Nu găsești emailul? Uită-te și în Spam, sau cere altul peste câteva minute.')}</p>
          </div>
          <BackToLogin onClick={() => setMode({ name: 'login' })} />
        </State>
      ) : (
        <State heading={heading} icon="wait" title={t('Contul tău așteaptă aprobarea')}>
          <div role="status">
            <p>
              {t('Adresa')}{' '}<b>{mode.email}</b>{' '}{t('este confirmată. Un administrator aprobă contul; vei primi un email după aprobare.')}
            </p>
          </div>
          <button type="button" className="button-quiet way-in-wide" onClick={() => setMode({ name: 'login' })}>
            <ActionIcon name="logout" />
            {t('Ieși')}
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
        {t('Înapoi la pagina de intrare')}
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
    // Every page reads its data again, now with the login. A tab that loaded
    // the visit counter starts again instead, so the counter never sees a
    // page of a logged-in teacher.
    onSuccess: async (teacher) => {
      if (teacherCounterLoaded()) {
        visitTab.reload();
        return;
      }
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
        <label htmlFor="login-email">{t('Adresa de email')}</label>
        <input id="login-email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
      </div>
      <div className="form-field">
        <div className="way-in-label-row">
          <label htmlFor="login-password">{t('Parola')}</label>
          <button type="button" className="link-button" onClick={onForgot}>
            {t('Am uitat parola')}
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
        <ActionIcon name="login" />
        {login.isPending ? t('Se verifică…') : t('Intră')}
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
        <label htmlFor="forgot-email">{t('Adresa de email')}</label>
        <input id="forgot-email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
      </div>
      <button className="button way-in-wide" type="submit" disabled={forgot.isPending}>
        <ActionIcon name="send" />
        {forgot.isPending ? t('Se trimite…') : t('Trimite linkul')}
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
  const signup = useMutation({
    mutationFn: () => api.signup({ name, email, password }),
    onSuccess: () => {
      countVisitEvent('account-request-sent');
      onSent();
    },
  });

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
          <label htmlFor="signup-name">{t('Numele tău')}</label>
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
          <label htmlFor="signup-email">{t('Adresa de email')}</label>
          <input id="signup-email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
        </div>
        <div className="form-field">
          <label htmlFor="signup-password">
            {t('Parola')}{' '}<span className="form-hint">{t('(cel puțin {MIN_PASSWORD_LENGTH} caractere)', { MIN_PASSWORD_LENGTH })}</span>
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
          <ActionIcon name="add-person" />
          {signup.isPending ? t('Se trimite…') : t('Cere contul')}
        </button>
        {signup.error && <ErrorMessage error={signup.error} />}
      </form>
      <p className="way-in-note">
        <b>{t('Contul demo:')}</b>{' '}{t('poți corecta un test, cu cel mult')}{' '}{countLabel(DEMO_PAPER_LIMIT, 'lucrare', 'lucrări')}{t('. Întâi confirmi adresa de email, apoi un administrator aprobă contul.')}
      </p>
    </>
  );
}
