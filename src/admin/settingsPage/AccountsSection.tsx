import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { Account } from '../../../shared/api.ts';
import { DEMO_TEST_LIMIT } from '../../../shared/accounts.ts';
import { formatDateTime } from '../../ui/format.ts';
import { useApi } from '../ApiContext.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';

// The accounts part of Setări: the administrators approve or refuse new
// accounts, make a demo account complete, close an account, and give a
// teacher who forgot it a new password.
export function AccountsSection() {
  const api = useApi();
  const accounts = useQuery({ queryKey: ['accounts'], queryFn: () => api.listAccounts() });
  const me = useQuery({ queryKey: ['me'], queryFn: () => api.me() });
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
            <ol className="row-list">
              {pending.map((account) => (
                <PendingItem key={account.id} account={account} />
              ))}
            </ol>
          )}
          <h3>Profesori</h3>
          <ol className="row-list">
            {others.map((account) => (
              <AccountItem key={account.id} account={account} isSelf={account.id === me.data?.id} />
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

export function accountTag(account: Account): string {
  if (account.role === 'admin') return 'administrator';
  if (account.status === 'disabled') return 'închis';
  if (account.demo) return `demo: ${Math.min(account.testsEvaluated, DEMO_TEST_LIMIT)} din ${DEMO_TEST_LIMIT} teste`;
  return 'complet';
}

// An administrator changes their own password on Contul meu.
function AccountItem({ account, isSelf }: { account: Account; isSelf: boolean }) {
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
      {!isSelf && (
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
