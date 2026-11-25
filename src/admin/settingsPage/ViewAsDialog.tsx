import { useMutation } from '@tanstack/react-query';
import { useState, type FormEvent, type RefObject } from 'react';
import type { Account } from '../../../shared/api.ts';
import { ActionIcon } from '../../ui/ActionIcon.tsx';
import { t } from '../../i18n/t.ts';
import { useApi } from '../ApiContext.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';
import { Modal } from '../Modal.tsx';
import { forgetAccountState, rememberViewedName, viewTab } from '../shell/viewing.ts';

// The way into a read-only view of a teacher's account: the administrator
// types their own password, and on success the teacher app loads again as the
// viewed account.
export function ViewAsDialog({
  account,
  onClose,
  returnFocus,
}: {
  account: Account;
  onClose(): void;
  returnFocus: RefObject<HTMLElement | null>;
}) {
  const api = useApi();
  const [password, setPassword] = useState('');
  const start = useMutation({
    mutationFn: () => api.startView(account.id, password),
    onSuccess: () => {
      rememberViewedName(account.name);
      forgetAccountState();
      viewTab.leave('/teacher/');
    },
  });
  return (
    <Modal title={t('Vezi contul lui {name}', { name: account.name })} onClose={start.isPending ? () => {} : onClose} returnFocus={returnFocus}>
      <form
        className="modal-body"
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          start.mutate();
        }}
      >
        <p>{t('Ca să vezi contul lui {name}, scrie parola ta.', { name: account.name })}</p>
        <div className="modal-field">
          <label htmlFor="view-as-password">{t('Parola ta')}</label>
          <input
            id="view-as-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </div>
        {start.error && <ErrorMessage error={start.error} />}
        <div className="card-actions">
          <button type="submit" className="button" disabled={start.isPending}>
            <ActionIcon name="eye" />
            {t('Vezi contul')}
          </button>
          <button type="button" className="button-quiet" disabled={start.isPending} onClick={onClose}>
            {t('Renunță')}
          </button>
        </div>
      </form>
    </Modal>
  );
}
