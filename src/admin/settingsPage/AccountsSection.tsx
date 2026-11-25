import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState, type RefObject } from 'react';
import type { AccountEventKind } from '../../../shared/accounts.ts';
import type { Account, AccountDetail, AccountView, RefusedAccount, Teacher } from '../../../shared/api.ts';
import { DEMO_PAPER_LIMIT } from '../../../shared/accounts.ts';
import { countLabel, formatDateTime, formatFileSize } from '../../ui/format.ts';
import { useApi } from '../ApiContext.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';
import { ViewAsDialog } from './ViewAsDialog.tsx';
import { useSmallMenu } from '../shell/useSmallMenu.ts';
import { ActionIcon } from '../../ui/ActionIcon.tsx';
import { t, locale } from '../../i18n/t.ts';

// "Conturi" of Setări (redesign spec §11.8): the administrators approve or
// refuse new accounts (one by one, or all that wait at once), make a demo
// account complete, close an account, give a teacher who forgot it a new
// password, and choose for each account whether the test page shows it
// "Indicații suplimentare pentru corectare". Only accounts whose email is
// confirmed are listed.
export function AccountsSection() {
  const api = useApi();
  const accounts = useQuery({ queryKey: ['accounts'], queryFn: () => api.listAccounts() });
  const refused = useQuery({ queryKey: ['refused-accounts'], queryFn: () => api.listRefusedAccounts() });
  const pending = accounts.data?.filter((account) => account.status === 'pending') ?? [];
  const others = accounts.data?.filter((account) => account.status !== 'pending') ?? [];
  const waitingHeading = useRef<HTMLHeadingElement>(null);
  const allHeading = useRef<HTMLHeadingElement>(null);
  const waitingBefore = useRef(pending.length);

  // An approved or refused account takes its row (and the last one its card)
  // with the focused button: the focus goes to the card's heading, or to the
  // list's once the card is gone.
  useEffect(() => {
    const fewer = pending.length < waitingBefore.current;
    waitingBefore.current = pending.length;
    if (!fewer || (document.activeElement && document.activeElement !== document.body)) return;
    (waitingHeading.current ?? allHeading.current)?.focus();
  }, [pending.length]);

  return (
    <>
      {accounts.isPending && <p>{t('Se încarcă…')}</p>}
      {accounts.error && <ErrorMessage error={accounts.error} />}
      {accounts.data && (
        <>
          {pending.length > 0 && <WaitingCard pending={pending} heading={waitingHeading} />}
          <section className="class-card" aria-labelledby="accounts-all">
            <div className="class-card-head">
              <h2 id="accounts-all" ref={allHeading} tabIndex={-1}>
                {t('Toate conturile')}
              </h2>
              <span>{countLabel(others.length, 'cont', 'conturi')}</span>
            </div>
            <table className="accounts-table" aria-labelledby="accounts-all">
              <thead>
                <tr>
                  <th scope="col">{t('Cont')}</th>
                  <th scope="col">{t('Felul')}</th>
                  <th scope="col">{t('Până acum')}</th>
                  <th scope="col">{t('Indicații la corectare')}</th>
                  <th scope="col">
                    <span className="sr-only">{t('Acțiuni')}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {others.map((account) => (
                  <AccountRow key={account.id} account={account} />
                ))}
              </tbody>
            </table>
            <p className="class-card-foot">
              {t('„Indicații la corectare”: dacă pagina testului arată contului secțiunea „Indicații suplimentare pentru corectare”. La un cont nou o văd doar administratorii.')}
            </p>
          </section>
          {refused.data && refused.data.length > 0 && <RefusedCard refused={refused.data} />}
        </>
      )}
    </>
  );
}

// The requests an administrator refused, newest first: the account is gone, so
// this is what is left of it.
function RefusedCard({ refused }: { refused: RefusedAccount[] }) {
  return (
    <section className="class-card" aria-labelledby="accounts-refused">
      <div className="class-card-head">
        <h2 id="accounts-refused">{t('Conturi refuzate')}</h2>
        <span>{countLabel(refused.length, 'cerere', 'cereri')}</span>
      </div>
      <table className="accounts-table" aria-labelledby="accounts-refused">
        <thead>
          <tr>
            <th scope="col">{t('Cont')}</th>
            <th scope="col">{t('Cerut')}</th>
            <th scope="col">{t('Refuzat')}</th>
            <th scope="col">{t('De')}</th>
          </tr>
        </thead>
        <tbody>
          {refused.map((request) => (
            <tr key={`${request.email}-${request.refusedAt}`}>
              <th scope="row">
                <span className="account-person">
                  {request.name}
                  <span>{request.email}</span>
                </span>
              </th>
              <td>{formatDateTime(request.askedAt)}</td>
              <td>{formatDateTime(request.refusedAt)}</td>
              <td>{request.by ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="class-card-foot">{t('Cererile refuzate se șterg: aici rămâne doar cine le-a cerut și cine le-a refuzat.')}</p>
    </section>
  );
}

function useReload() {
  const queryClient = useQueryClient();
  // A refusal wrote a row in the refused accounts' journal.
  return () => {
    void queryClient.invalidateQueries({ queryKey: ['accounts'] });
    void queryClient.invalidateQueries({ queryKey: ['refused-accounts'] });
  };
}

function Person({ account }: { account: Account }) {
  return (
    <th scope="row">
      <span className="account-person">
        {account.name}
        <span>{account.email}</span>
      </span>
    </th>
  );
}

// The accounts that wait, in a red-edged card; it goes when none waits.
function WaitingCard({ pending, heading }: { pending: Account[]; heading: RefObject<HTMLHeadingElement | null> }) {
  return (
    <section className="class-card accounts-waiting" aria-labelledby="accounts-waiting">
      <div className="class-card-head">
        <h2 id="accounts-waiting" ref={heading} tabIndex={-1}>
          {t('{countLabel} așteaptă aprobarea', { countLabel: countLabel(pending.length, 'cont', 'conturi') })}</h2>
        {pending.length > 1 && <RejectAll pending={pending} />}
      </div>
      <table className="accounts-table" aria-labelledby="accounts-waiting">
        <thead>
          <tr>
            <th scope="col">{t('Cont')}</th>
            <th scope="col">{t('Cerut')}</th>
            <th scope="col">Email</th>
            <th scope="col">
              <span className="sr-only">{t('Acțiuni')}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {pending.map((account) => (
            <PendingRow key={account.id} account={account} />
          ))}
        </tbody>
      </table>
      <p className="class-card-foot">{t('Un cont aprobat este un cont demo: un test, cel mult {DEMO_PAPER_LIMIT} de lucrări. Îl faci complet din lista de mai jos.', { DEMO_PAPER_LIMIT })}</p>
    </section>
  );
}

// For a wave of sign-ups nobody knows: every account the page shows as
// waiting goes at once.
function RejectAll({ pending }: { pending: Account[] }) {
  const api = useApi();
  const reload = useReload();
  const rejectAll = useMutation({
    mutationFn: () => api.rejectAllAccounts(pending.map((account) => ({ id: account.id, createdAt: account.createdAt }))),
    onSettled: reload,
  });
  return (
    <>
      <button
        type="button"
        className="text-button is-danger"
        disabled={rejectAll.isPending}
        onClick={() => {
          if (window.confirm(t('Refuzi toate cele {length} conturi care așteaptă? Cererile se șterg.', { length: pending.length }))) rejectAll.mutate();
        }}
      >
        <ActionIcon name="close" />
        {t('Refuză toate')}
      </button>
      {rejectAll.error && <ErrorMessage error={rejectAll.error} />}
    </>
  );
}

function PendingRow({ account }: { account: Account }) {
  const api = useApi();
  const reload = useReload();
  // A refusal means the page was out of date: read the accounts again.
  const approve = useMutation({ mutationFn: () => api.approveAccount(account.id, account.createdAt), onSettled: reload });
  const reject = useMutation({ mutationFn: () => api.rejectAccount(account.id, account.createdAt), onSettled: reload });
  const error = approve.error ?? reject.error;

  return (
    <>
      <tr>
        <Person account={account} />
        <td>{formatDateTime(account.createdAt)}</td>
        <td>
          <span className="tag tag-ok">{t('confirmat')}</span>
        </td>
        <td>
          <span className="account-actions">
            <button
              type="button"
              className="button button-small"
              aria-label={t('Aprobă {name}', { name: account.name })}
              disabled={approve.isPending}
              onClick={() => approve.mutate()}
            >
              <ActionIcon name="check" />
              {t('Aprobă')}
            </button>
            <button
              type="button"
              className="button-quiet button-small"
              aria-label={t('Refuză {name}', { name: account.name })}
              disabled={reject.isPending}
              onClick={() => {
                if (window.confirm(t('Refuzi contul lui {name}? Cererea se șterge.', { name: account.name }))) reject.mutate();
              }}
            >
              <ActionIcon name="close" />
              {t('Refuză')}
            </button>
          </span>
        </td>
      </tr>
      {error && (
        <tr className="accounts-follow">
          <td colSpan={4}>
            <ErrorMessage error={error} />
          </td>
        </tr>
      )}
    </>
  );
}

// The kind of an account, as its tag: "administrator", "complet", "demo" or
// "închis".
export function accountKind(account: Account): { label: string; className: string } {
  if (account.role === 'admin') return { label: t('administrator'), className: 'tag tag-ok' };
  if (account.status === 'disabled') return { label: t('închis'), className: 'tag tag-muted' };
  if (account.demo) return { label: t('demo'), className: 'tag' };
  return { label: t('complet'), className: 'tag tag-ok' };
}

// What an account used: how many times its tests went to the robot for
// grading, and how many papers the robot graded ("din 35" for a demo account).
export function accountUse(account: Account): string {
  const tests = countLabel(account.testsEvaluated, 'test', 'teste');
  if (account.demo && account.role === 'teacher' && account.status === 'active') {
    return t('{tests} · {min} din {DEMO_PAPER_LIMIT} de lucrări', { tests, min: Math.min(account.papersGraded, DEMO_PAPER_LIMIT), DEMO_PAPER_LIMIT });
  }
  return `${tests} · ${countLabel(account.papersGraded, 'lucrare', 'lucrări')}`;
}

// Administrators' accounts do not change here: an administrator changes their
// own password on Contul meu, or with `npm run set-password`.
function AccountRow({ account }: { account: Account }) {
  const api = useApi();
  const queryClient = useQueryClient();
  const reload = useReload();
  const [password, setPassword] = useState<string | null>(null);
  const [details, setDetails] = useState(false);
  const detailsId = `account-details-${account.id}`;
  const update = useMutation({
    mutationFn: (change: { demo?: boolean; status?: 'active' | 'disabled' }) => api.updateAccount(account.id, change),
    onSuccess: (accounts) => {
      queryClient.setQueryData(['accounts'], accounts);
      // An open "Detalii" reads the history again: a change just wrote one.
      void queryClient.invalidateQueries({ queryKey: ['account', account.id] });
    },
    onError: reload,
  });
  const reset = useMutation({
    mutationFn: () => api.resetPassword(account.id),
    onSuccess: (made) => {
      setPassword(made);
      void queryClient.invalidateQueries({ queryKey: ['account', account.id] });
    },
  });
  const kind = accountKind(account);
  const error = update.error ?? reset.error;

  return (
    <>
      <tr className={account.status === 'disabled' ? 'is-muted' : undefined}>
        <Person account={account} />
        <td>
          <span className={kind.className}>{kind.label}</span>
        </td>
        <td>{accountUse(account)}</td>
        <td>
          <BaremNotesSwitch account={account} />
        </td>
        <td>
          <div className="account-actions">
            <button
              type="button"
              className="button-quiet button-small"
              aria-label={t('Detalii pentru {name}', { name: account.name })}
              aria-expanded={details}
              aria-controls={details ? detailsId : undefined}
              onClick={() => setDetails((open) => !open)}
            >
              <ActionIcon name="info" />
              {t('Detalii')}
            </button>
            {account.role === 'teacher' && (
              <AccountMenu
                account={account}
                busy={update.isPending || reset.isPending}
                onChange={(change) => update.mutate(change)}
                onNewPassword={() => reset.mutate()}
              />
            )}
          </div>
        </td>
      </tr>
      {(password || error) && (
        <tr className="accounts-follow">
          <td colSpan={5}>
            {password && (
              <div className="warning" role="status">
                <p>
                  {t('Parola nouă a lui')}{' '}{account.name}: <code>{password}</code>
                </p>
                <p>{t('Trimite-o profesorului acum: după ce pleci de pe pagină, nu o mai vezi. Profesorul o schimbă din Contul meu.')}</p>
              </div>
            )}
            {error && <ErrorMessage error={error} />}
          </td>
        </tr>
      )}
      {details && (
        <tr className="accounts-follow">
          <td colSpan={5} id={detailsId}>
            <AccountDetails account={account} />
          </td>
        </tr>
      )}
    </>
  );
}

// "Indicații la corectare" of one account: saved as soon as it changes, like
// the controls of "Corectarea". The box shows the new value at once and a
// refusal puts back this account's saved value only, so it never undoes
// another row's save. The saves of one box run one after the other, so the
// last click is what the database keeps. The administrator's own account also
// changes their own test page.
function BaremNotesSwitch({ account }: { account: Account }) {
  const api = useApi();
  const queryClient = useQueryClient();
  const setShown = (show: boolean) =>
    queryClient.setQueryData<Account[]>(['accounts'], (list) =>
      list?.map((shown) => (shown.id === account.id ? { ...shown, showBaremNotes: show } : shown)),
    );
  const save = useMutation({
    scope: { id: `barem-notes-${account.id}` },
    mutationFn: (show: boolean) => api.setShowBaremNotes(account.id, show),
    onMutate: async (show: boolean) => {
      // A read of the list on its way would show the old value again.
      await queryClient.cancelQueries({ queryKey: ['accounts'] });
      const saved = queryClient.getQueryData<Account[]>(['accounts'])?.find((shown) => shown.id === account.id)?.showBaremNotes;
      setShown(show);
      return { saved };
    },
    onError: (_error, _show, context) => {
      if (context?.saved !== undefined) setShown(context.saved);
    },
    onSuccess: (accounts) => {
      queryClient.setQueryData(['accounts'], accounts);
      if (queryClient.getQueryData<Teacher>(['me'])?.id === account.id) void queryClient.invalidateQueries({ queryKey: ['me'] });
    },
  });
  return (
    <>
      <label className="check-label">
        <input
          type="checkbox"
          aria-label={t('Arată indicațiile suplimentare pentru corectare: {name}', { name: account.name })}
          checked={account.showBaremNotes}
          aria-busy={save.isPending}
          onChange={(event) => save.mutate(event.target.checked)}
        />
        {t('Arată indicațiile')}
      </label>
      {save.error && <ErrorMessage error={save.error} />}
    </>
  );
}

const EVENT_LABEL: Record<AccountEventKind, string> = {
  created: t('Cont creat'),
  email_confirmed: t('Email confirmat'),
  approved: t('Cont aprobat'),
  demo: t('Făcut cont demo'),
  complete: t('Făcut cont complet'),
  password: t('Parolă schimbată'),
  closed: t('Cont închis'),
  reopened: t('Cont redeschis'),
};

// "Detalii": what the account used, the robot's work by kind and by test, and
// its whole history, read only when opened.
function AccountDetails({ account }: { account: Account }) {
  const api = useApi();
  const detail = useQuery({ queryKey: ['account', account.id], queryFn: () => api.getAccount(account.id) });
  return (
    <>
      {detail.isPending && <p>{t('Se încarcă…')}</p>}
      {detail.error && <ErrorMessage error={detail.error} />}
      {detail.data && <AccountDetailView detail={detail.data} />}
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </>
  );
}

const THOUSANDS = new Intl.NumberFormat(locale());
const tokenLabel = (tokens: number) => (tokens > 0 ? THOUSANDS.format(tokens) : '—');

// The rows of the robot's work, in the order of the work a test goes through.
const ROBOT_KINDS = [
  { kind: 'grading', label: t('Corectări') },
  { kind: 'exercise_list', label: t('Liste de exerciții') },
  { kind: 'analysis', label: t('Analize ale clasei') },
  { kind: 'barem', label: t('Bareme') },
  { kind: 'print', label: t('Teste pentru tipărire') },
] as const;

// What the robot did for the account: the work of each kind that worked, the
// attempts it gave up on, and the tokens Claude reported. The print PDFs are
// made without Claude, so they have no tokens.
function RobotWorkTable({ robot }: { robot: AccountDetail['robot'] }) {
  const done = ROBOT_KINDS.reduce((sum, row) => sum + robot[row.kind].done, 0);
  const failed = ROBOT_KINDS.reduce((sum, row) => sum + robot[row.kind].failed, 0);
  if (done + failed === 0) return <p>{t('Robotul nu a lucrat încă pentru acest cont.')}</p>;
  return (
    <>
      <div className="table-wrap">
        <table className="account-work">
          <thead>
            <tr>
              <th scope="col">{t('Operația')}</th>
              <th scope="col">{t('Reușite')}</th>
              <th scope="col">{t('Eșuate')}</th>
              <th scope="col">{t('Tokeni')}</th>
            </tr>
          </thead>
          <tbody>
            {ROBOT_KINDS.map(({ kind, label }) => (
              <tr key={kind}>
                <th scope="row">{label}</th>
                <td>{THOUSANDS.format(robot[kind].done)}</td>
                <td>{robot[kind].failed > 0 ? THOUSANDS.format(robot[kind].failed) : '—'}</td>
                <td>{tokenLabel(robot[kind].tokens)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="account-failure">
        {failed === 0
          ? t('Nicio încercare ratată.')
          : t('Rata eșecurilor: {round}% ({countLabel} din {v3}).', { round: Math.round((100 * failed) / (done + failed)), countLabel: countLabel(failed, 'încercare ratată', 'încercări ratate'), v3: done + failed })}
      </p>
    </>
  );
}

// One row per test of the account: what the robot did for it, what it graded,
// and how many of its points the teacher corrected.
function TestWorkTable({ tests }: { tests: AccountDetail['tests'] }) {
  if (tests.length === 0) return <p>{t('Niciun test încă.')}</p>;
  return (
    <div className="table-wrap">
      <table className="account-work">
        <thead>
          <tr>
            <th scope="col">{t('Testul')}</th>
            <th scope="col">{t('Clasa')}</th>
            <th scope="col">{t('Lucrări corectate')}</th>
            <th scope="col">{t('Operații ale robotului')}</th>
            <th scope="col">{t('Puncte corectate')}</th>
            <th scope="col">{t('Tokeni')}</th>
          </tr>
        </thead>
        <tbody>
          {tests.map((test) => {
            const operations =
              test.robot.barems +
              test.robot.exerciseLists +
              test.robot.analyses +
              test.robot.prints +
              test.robot.gradings +
              test.robot.failures;
            return (
              <tr key={test.code}>
                <th scope="row">
                  <span className="account-person">
                    {test.title}
                    <span>{test.code}</span>
                  </span>
                </th>
                <td>{test.className}</td>
                <td>{THOUSANDS.format(test.papers)}</td>
                <td>{operations > 0 ? THOUSANDS.format(operations) : '—'}</td>
                <td>{test.pointsChanged > 0 ? THOUSANDS.format(test.pointsChanged) : '—'}</td>
                <td>{tokenLabel(test.robot.tokens)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const VIEW_END_LABEL: Record<NonNullable<AccountView['endReason']>, () => string> = {
  exit: () => t('Ieșit'),
  expired: () => t('Timpul s-a terminat'),
  replaced: () => t('Înlocuit de altă vizualizare'),
  session_gone: () => t('Intrarea s-a încheiat'),
};

// The times an administrator looked at the account, newest first.
function ViewsTable({ views }: { views: AccountView[] }) {
  return (
    <div className="table-wrap">
      <table className="account-work">
        <thead>
          <tr>
            <th scope="col">{t('Administrator')}</th>
            <th scope="col">{t('Început')}</th>
            <th scope="col">{t('Sfârșit')}</th>
            <th scope="col">{t('Cum s-a încheiat')}</th>
          </tr>
        </thead>
        <tbody>
          {views.map((view, index) => (
            <tr key={`${view.startedAt}-${index}`}>
              <th scope="row">{view.admin?.name ?? '—'}</th>
              <td>{formatDateTime(view.startedAt)}</td>
              <td>{view.endedAt ? formatDateTime(view.endedAt) : '—'}</td>
              <td>{view.endReason ? VIEW_END_LABEL[view.endReason]() : t('în curs')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AccountDetailView({ detail }: { detail: AccountDetail }) {
  const { account, events, counts, activity, robot, tests, views } = detail;
  return (
    <div className="account-detail">
      <div>
        <h3>{t('Activitatea contului')}</h3>
        <dl className="account-stats">
          <Stat label={t('Teste trimise la corectare')} value={countLabel(account.testsEvaluated, 'test', 'teste')} />
          <Stat label={t('Lucrări corectate')} value={countLabel(account.papersGraded, 'lucrare', 'lucrări')} />
          <Stat label={t('Lucrări în lucru acum')} value={countLabel(account.papersWaiting, 'lucrare', 'lucrări')} />
          <Stat label={t('Bareme generate de robot')} value={countLabel(account.baremsGenerated, 'barem', 'bareme')} />
          <Stat label={t('Liste de exerciții generate')} value={countLabel(account.exerciseListsMade, 'listă', 'liste')} />
          <Stat label={t('Analize ale clasei generate')} value={countLabel(account.analysesMade, 'analiză', 'analize')} />
          <Stat label={t('Teste pregătite pentru tipărire')} value={countLabel(account.printsMade, 'test', 'teste')} />
          <Stat label={t('Clase')} value={countLabel(counts.classes, 'clasă', 'clase')} />
          <Stat label={t('Elevi')} value={countLabel(counts.students, 'elev', 'elevi')} />
          <Stat label={t('Teste create')} value={countLabel(counts.tests, 'test', 'teste')} />
          <Stat label={t('Teste corectate în ultimele 30 de zile')} value={countLabel(activity.testsLast30Days, 'test', 'teste')} />
          <Stat label={t('Lucrări corectate în ultimele 30 de zile')} value={countLabel(activity.papersLast30Days, 'lucrare', 'lucrări')} />
          <Stat label={t('Spațiul lucrărilor')} value={activity.r2Bytes > 0 ? formatFileSize(activity.r2Bytes) : t('nimic')} />
          <Stat label={t('Ultima intrare')} value={account.lastLoginAt ? formatDateTime(account.lastLoginAt) : t('niciodată')} />
        </dl>
        <p className="hint">
          {t('Baremele, listele de exerciții, analizele și testele pentru tipărire sunt operațiile robotului din afara corectării lucrărilor.')}
        </p>
      </div>
      <div>
        <h3>{t('Consumul robotului')}</h3>
        <RobotWorkTable robot={robot} />
      </div>
      <div className="account-detail-wide">
        <h3>{t('Fiecare test')}</h3>
        <TestWorkTable tests={tests} />
      </div>
      <div className="account-detail-wide">
        <h3>{t('Istoricul contului')}</h3>
        {events.length > 0 ? (
          <ol className="account-history">
            {events.map((event, index) => (
              <li key={`${event.kind}-${event.at}-${index}`}>
                <span>
                  {EVENT_LABEL[event.kind]}
                  {event.by && event.by.id !== account.id && <span className="by">{' '}{t('de {name}', { name: event.by.name })}</span>}
                </span>
                <time dateTime={event.at}>{formatDateTime(event.at)}</time>
              </li>
            ))}
          </ol>
        ) : (
          <p>{t('Nicio schimbare înregistrată.')}</p>
        )}
      </div>
      {views.length > 0 && (
        <div className="account-detail-wide">
          <h3>{t('Vizualizări de administrator')}</h3>
          <ViewsTable views={views} />
        </div>
      )}
    </div>
  );
}

// ⋯ of a teacher's row. An item closes the menu and gives the focus back to
// ⋯ before it asks or acts.
function AccountMenu({
  account,
  busy,
  onChange,
  onNewPassword,
}: {
  account: Account;
  busy: boolean;
  onChange(change: { demo?: boolean; status?: 'active' | 'disabled' }): void;
  onNewPassword(): void;
}) {
  const { open, toggle, box, button } = useSmallMenu();
  const menuId = `account-menu-${account.id}`;
  const run = (action: () => void) => () => {
    toggle();
    button.current?.focus();
    action();
  };
  const active = account.status === 'active';
  const [viewing, setViewing] = useState(false);

  return (
    <div className="class-more account-more" ref={box}>
      <button
        ref={button}
        type="button"
        className="class-more-button"
        aria-label={t('Mai multe pentru {name}', { name: account.name })}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={toggle}
      >
        <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <circle cx="3.5" cy="8" r="1.4" />
          <circle cx="8" cy="8" r="1.4" />
          <circle cx="12.5" cy="8" r="1.4" />
        </svg>
      </button>
      {open && (
        <div className="class-menu class-more-menu" id={menuId} role="menu">
          {active ? (
            <button type="button" role="menuitem" className="class-menu-item has-icon" disabled={busy} onClick={run(() => onChange({ demo: !account.demo }))}>
              <ActionIcon name={account.demo ? 'unlock' : 'clock'} />
              {account.demo ? t('Fă cont complet') : t('Fă cont demo')}
            </button>
          ) : (
            <button type="button" role="menuitem" className="class-menu-item has-icon" disabled={busy} onClick={run(() => onChange({ status: 'active' }))}>
              <ActionIcon name="login" />
              {t('Redeschide contul')}
            </button>
          )}
          <button
            type="button"
            role="menuitem"
            className="class-menu-item has-icon"
            disabled={busy}
            onClick={run(() => {
              if (window.confirm(t('Faci o parolă nouă pentru {name}? Parola de acum nu va mai funcționa.', { name: account.name }))) onNewPassword();
            })}
          >
            <ActionIcon name="key" />
            {t('Parolă nouă')}
          </button>
          {active && (
            <button
              type="button"
              role="menuitem"
              className="class-menu-item has-icon is-danger"
              disabled={busy}
              onClick={run(() => {
                if (window.confirm(t('Închizi contul lui {name}? Nu va mai putea intra, dar datele rămân.', { name: account.name }))) onChange({ status: 'disabled' });
              })}
            >
              <ActionIcon name="lock" />
              {t('Închide contul')}
            </button>
          )}
          {active && (
            <button type="button" role="menuitem" className="class-menu-item has-icon" disabled={busy} onClick={run(() => setViewing(true))}>
              <ActionIcon name="eye" />
              {t('Vezi ca {name}', { name: account.name })}
            </button>
          )}
        </div>
      )}
      {viewing && <ViewAsDialog account={account} onClose={() => setViewing(false)} returnFocus={button} />}
    </div>
  );
}
