import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { ActionIcon } from '../ui/ActionIcon.tsx';
import { ErrorMessage } from '../admin/ErrorMessage.tsx';
import { ApiError } from '../ui/ApiError.ts';
import { forgetStoredTry, saveDeletedAt } from '../landing/quickTry/storage.ts';
import { t } from '../i18n/t.ts';
import type { TryApi } from './api.ts';

// "Șterge încercarea": a quiet button that asks once more, then deletes the
// try, its files and its link, and goes back to the landing page. The day's
// limits keep counting the try, so this device keeps a mark: one try per
// device per day holds after a delete (a try that had failed leaves none; an
// administrator is never limited, and the landing page knows her).
export function DeleteTry({ tryApi, madeAt, goTo = (address) => window.location.assign(address) }: { tryApi: TryApi; madeAt: string; goTo?: (address: string) => void }) {
  const [asking, setAsking] = useState(false);
  const remove = useMutation({
    mutationFn: async () => {
      try {
        return (await tryApi.deleteTry()).counted;
      } catch (err) {
        // A link that is already gone counts as deleted.
        if (err instanceof ApiError && (err.status === 404 || err.status === 410)) return true;
        throw err;
      }
    },
    onSuccess: (counted) => {
      if (counted) saveDeletedAt(window.localStorage, madeAt);
      forgetStoredTry(window.localStorage);
      goTo('/');
    },
  });
  if (!asking) {
    return (
      <button type="button" className="button-quiet" onClick={() => setAsking(true)}>
        <svg className="action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
          <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-12M9 7V4h6v3" />
        </svg>
        {t('Șterge')}
      </button>
    );
  }
  return (
    <div className="try-delete-ask" role="group" aria-label={t('Șterge încercarea')}>
      <p className="hint">{t('Sigur? Încercarea, lucrarea și linkul se șterg definitiv.')}</p>
      <div className="try-delete-actions">
        <button type="button" className="button try-delete-confirm" disabled={remove.isPending || remove.isSuccess} onClick={() => remove.mutate()}>
          <ActionIcon name="check" />
          {t('Șterge definitiv')}
        </button>
        <button
          type="button"
          className="button-quiet"
          disabled={remove.isPending}
          onClick={() => {
            remove.reset();
            setAsking(false);
          }}
        >
          <ActionIcon name="close" />
          {t('Renunță')}
        </button>
      </div>
      {remove.error && <ErrorMessage error={remove.error} />}
    </div>
  );
}
