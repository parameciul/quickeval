import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState, type RefObject } from 'react';
import type { Account } from '../../../shared/api.ts';
import { DEMO_PAPER_LIMIT } from '../../../shared/accounts.ts';
import { countLabel, formatDateTime } from '../../ui/format.ts';
import { useApi } from '../ApiContext.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';
import { useSmallMenu } from '../shell/useSmallMenu.ts';

// "Conturi" of Setări (redesign spec §11.8): the administrators approve or
// refuse new accounts (one by one, or all that wait at once), make a demo
// account complete, close an account, and give a teacher who forgot it a new
// password. Only accounts whose email is confirmed are listed.
export function AccountsSection() {
  const api = useApi();
  const accounts = useQuery({ queryKey: ['accounts'], queryFn: () => api.listAccounts() });
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
      {accounts.isPending && <p>Se încarcă…</p>}
      {accounts.error && <ErrorMessage error={accounts.error} />}
      {accounts.data && (
        <>
          {pending.length > 0 && <WaitingCard pending={pending} heading={waitingHeading} />}
          <section className="class-card" aria-labelledby="accounts-all">
            <div className="class-card-head">
              <h2 id="accounts-all" ref={allHeading} tabIndex={-1}>
                Toate conturile
              </h2>
              <span>{countLabel(others.length, 'cont', 'conturi')}</span>
            </div>
            <table className="accounts-table" aria-labelledby="accounts-all">
              <thead>
                <tr>
                  <th scope="col">Cont</th>
                  <th scope="col">Felul</th>
                  <th scope="col">Până acum</th>
                  <th scope="col">
                    <span className="sr-only">Acțiuni</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {others.map((account) => (
                  <AccountRow key={account.id} account={account} />
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}
    </>
  );
}

function useReload() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ['accounts'] });
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
          {countLabel(pending.length, 'cont', 'conturi')} așteaptă aprobarea
        </h2>
        {pending.length > 1 && <RejectAll pending={pending} />}
      </div>
      <table className="accounts-table" aria-labelledby="accounts-waiting">
        <thead>
          <tr>
            <th scope="col">Cont</th>
            <th scope="col">Cerut</th>
            <th scope="col">Email</th>
            <th scope="col">
              <span className="sr-only">Acțiuni</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {pending.map((account) => (
            <PendingRow key={account.id} account={account} />
          ))}
        </tbody>
      </table>
      <p className="class-card-foot">
        Un cont aprobat este un cont demo: un test, cel mult {DEMO_PAPER_LIMIT} de lucrări. Îl faci complet din lista de mai jos.
      </p>
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
          if (window.confirm(`Refuzi toate cele ${pending.length} conturi care așteaptă? Cererile se șterg.`)) rejectAll.mutate();
        }}
      >
        Refuză toate
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
          <span className="tag tag-ok">confirmat</span>
        </td>
        <td>
          <span className="account-actions">
            <button
              type="button"
              className="button button-small"
              aria-label={`Aprobă ${account.name}`}
              disabled={approve.isPending}
              onClick={() => approve.mutate()}
            >
              Aprobă
            </button>
            <button
              type="button"
              className="button-quiet button-small"
              aria-label={`Refuză ${account.name}`}
              disabled={reject.isPending}
              onClick={() => {
                if (window.confirm(`Refuzi contul lui ${account.name}? Cererea se șterge.`)) reject.mutate();
              }}
            >
              Refuză
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
  if (account.role === 'admin') return { label: 'administrator', className: 'tag tag-ok' };
  if (account.status === 'disabled') return { label: 'închis', className: 'tag tag-muted' };
  if (account.demo) return { label: 'demo', className: 'tag' };
  return { label: 'complet', className: 'tag tag-ok' };
}

// What an account used: how many times its tests went to the robot for
// grading, and how many papers the robot graded ("din 35" for a demo account).
export function accountUse(account: Account): string {
  const tests = countLabel(account.testsEvaluated, 'test', 'teste');
  if (account.demo && account.role === 'teacher' && account.status === 'active') {
    return `${tests} · ${Math.min(account.papersGraded, DEMO_PAPER_LIMIT)} din ${DEMO_PAPER_LIMIT} de lucrări`;
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
  const update = useMutation({
    mutationFn: (change: { demo?: boolean; status?: 'active' | 'disabled' }) => api.updateAccount(account.id, change),
    onSuccess: (accounts) => queryClient.setQueryData(['accounts'], accounts),
    onError: reload,
  });
  const reset = useMutation({ mutationFn: () => api.resetPassword(account.id), onSuccess: setPassword });
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
          {account.role === 'teacher' && (
            <AccountMenu
              account={account}
              busy={update.isPending || reset.isPending}
              onChange={(change) => update.mutate(change)}
              onNewPassword={() => reset.mutate()}
            />
          )}
        </td>
      </tr>
      {(password || error) && (
        <tr className="accounts-follow">
          <td colSpan={4}>
            {password && (
              <div className="warning" role="status">
                <p>
                  Parola nouă a lui {account.name}: <code>{password}</code>
                </p>
                <p>Trimite-o profesorului acum: după ce pleci de pe pagină, nu o mai vezi. Profesorul o schimbă din Contul meu.</p>
              </div>
            )}
            {error && <ErrorMessage error={error} />}
          </td>
        </tr>
      )}
    </>
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

  return (
    <div className="class-more account-more" ref={box}>
      <button
        ref={button}
        type="button"
        className="class-more-button"
        aria-label={`Mai multe pentru ${account.name}`}
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
            <button type="button" role="menuitem" className="class-menu-item" disabled={busy} onClick={run(() => onChange({ demo: !account.demo }))}>
              {account.demo ? 'Fă cont complet' : 'Fă cont demo'}
            </button>
          ) : (
            <button type="button" role="menuitem" className="class-menu-item" disabled={busy} onClick={run(() => onChange({ status: 'active' }))}>
              Redeschide contul
            </button>
          )}
          <button
            type="button"
            role="menuitem"
            className="class-menu-item"
            disabled={busy}
            onClick={run(() => {
              if (window.confirm(`Faci o parolă nouă pentru ${account.name}? Parola de acum nu va mai funcționa.`)) onNewPassword();
            })}
          >
            Parolă nouă
          </button>
          {active && (
            <button
              type="button"
              role="menuitem"
              className="class-menu-item is-danger"
              disabled={busy}
              onClick={run(() => {
                if (window.confirm(`Închizi contul lui ${account.name}? Nu va mai putea intra, dar datele rămân.`)) onChange({ status: 'disabled' });
              })}
            >
              Închide contul
            </button>
          )}
        </div>
      )}
    </div>
  );
}
