import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { Account } from '../../../shared/api.ts';
import { DEMO_TEST_LIMIT } from '../../../shared/accounts.ts';
import { formatDateTime } from '../../ui/format.ts';
import { useApi } from '../ApiContext.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';

// The accounts part of Setări: the administrators approve or refuse new
// accounts (one by one, or all that wait at once), make a demo account
// complete, close an account, and give a teacher who forgot it a new password.
// Only accounts whose email is confirmed are listed.
export function AccountsSection() {
  const api = useApi();
  const accounts = useQuery({ queryKey: ['accounts'], queryFn: () => api.listAccounts() });
  const pending = accounts.data?.filter((account) => account.status === 'pending') ?? [];
  const others = accounts.data?.filter((account) => account.status !== 'pending') ?? [];

  return (
    <>
      <h2>Conturi</h2>
      {accounts.isPending && <p>Se încarcă…</p>}
      {accounts.error && <ErrorMessage error={accounts.error} />}
      {accounts.data && (
        <>
          <h3>Așteaptă aprobarea</h3>
          {pending.length === 0 ? (
            <p className="hint">Niciun cont nu așteaptă aprobarea.</p>
          ) : (
            <>
              <ol className="row-list">
                {pending.map((account) => (
                  <PendingItem key={account.id} account={account} />
                ))}
              </ol>
              {pending.length > 1 && <RejectAll pending={pending} />}
            </>
          )}
          <h3>Profesori</h3>
          <ol className="row-list">
            {others.map((account) => (
              <AccountItem key={account.id} account={account} />
            ))}
          </ol>
        </>
      )}
    </>
  );
}

function useReload() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ['accounts'] });
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
    <p>
      <button
        type="button"
        className="button-quiet button-small"
        disabled={rejectAll.isPending}
        onClick={() => {
          if (window.confirm(`Refuzi toate cele ${pending.length} conturi care așteaptă? Cererile se șterg.`)) rejectAll.mutate();
        }}
      >
        Refuză toate
      </button>
      {rejectAll.error && <ErrorMessage error={rejectAll.error} />}
    </p>
  );
}

function PendingItem({ account }: { account: Account }) {
  const api = useApi();
  const reload = useReload();
  // A refusal means the page was out of date: read the accounts again.
  const approve = useMutation({ mutationFn: () => api.approveAccount(account.id, account.createdAt), onSettled: reload });
  const reject = useMutation({ mutationFn: () => api.rejectAccount(account.id, account.createdAt), onSettled: reload });

  return (
    <li>
      <span className="row-name">
        {account.name} ({account.email})
      </span>
      <span className="hint">cerut la {formatDateTime(account.createdAt)}</span>
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
      {approve.error && <ErrorMessage error={approve.error} />}
      {reject.error && <ErrorMessage error={reject.error} />}
    </li>
  );
}

// The kind of account, and how many times its tests went to the robot for grading.
export function accountTag(account: Account): string {
  const evaluations = `${account.testsEvaluated} ${account.testsEvaluated === 1 ? 'evaluare' : 'evaluări'}`;
  if (account.role === 'admin') return `administrator · ${evaluations}`;
  if (account.status === 'disabled') return `închis · ${evaluations}`;
  if (account.demo) return `demo: ${Math.min(account.testsEvaluated, DEMO_TEST_LIMIT)} din ${DEMO_TEST_LIMIT} evaluări`;
  return `complet · ${evaluations}`;
}

// Administrators' accounts do not change here: an administrator changes their
// own password on Contul meu, or with `npm run set-password`.
function AccountItem({ account }: { account: Account }) {
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
  const isTeacher = account.role === 'teacher';

  return (
    <li className={account.status === 'disabled' ? 'is-muted' : undefined}>
      <span className="row-name">
        {account.name} ({account.email})
      </span>
      <span className="tag">{accountTag(account)}</span>
      {isTeacher && account.status === 'active' && (
        <button
          type="button"
          className="button-quiet button-small"
          aria-label={`${account.demo ? 'Fă cont complet' : 'Fă cont demo'}: ${account.name}`}
          disabled={update.isPending}
          onClick={() => update.mutate({ demo: !account.demo })}
        >
          {account.demo ? 'Fă cont complet' : 'Fă cont demo'}
        </button>
      )}
      {isTeacher && (
        <button
          type="button"
          className="button-quiet button-small"
          aria-label={`${account.status === 'active' ? 'Închide contul' : 'Redeschide contul'}: ${account.name}`}
          disabled={update.isPending}
          onClick={() => {
            if (account.status === 'disabled') update.mutate({ status: 'active' });
            else if (window.confirm(`Închizi contul lui ${account.name}? Nu va mai putea intra, dar datele rămân.`)) update.mutate({ status: 'disabled' });
          }}
        >
          {account.status === 'active' ? 'Închide contul' : 'Redeschide contul'}
        </button>
      )}
      {isTeacher && (
        <button
          type="button"
          className="button-quiet button-small"
          aria-label={`Parolă nouă: ${account.name}`}
          disabled={reset.isPending}
          onClick={() => {
            if (window.confirm(`Faci o parolă nouă pentru ${account.name}? Parola de acum nu va mai funcționa.`)) reset.mutate();
          }}
        >
          Parolă nouă
        </button>
      )}
      {password && (
        <div className="warning" role="status">
          <p>
            Parola nouă a lui {account.name}: <code>{password}</code>
          </p>
          <p>Trimite-o profesorului acum: după ce pleci de pe pagină, nu o mai vezi. Profesorul o schimbă din Contul meu.</p>
        </div>
      )}
      {update.error && <ErrorMessage error={update.error} />}
      {reset.error && <ErrorMessage error={reset.error} />}
    </li>
  );
}
