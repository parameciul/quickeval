import { useMutation } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { ActionIcon } from '../ui/ActionIcon.tsx';
import { ErrorMessage } from '../admin/ErrorMessage.tsx';
import { ApiError } from '../ui/ApiError.ts';
import { forgetStoredTry, readDeletedAt, readStoredTry, saveDeletedAt } from '../landing/quickTry/storage.ts';
import { t } from '../i18n/t.ts';
import type { TryApi } from './api.ts';

// "Șterge încercarea": a quiet button that asks once more, then deletes the
// try, its files and its link, and goes back to the landing page. The day's
// limits keep counting the try, so this device keeps a mark: one try per
// device per day holds after a delete (a try that had failed leaves none; an
// administrator is never limited, and the landing page knows her).
export function DeleteTry({ tryApi, token, madeAt, goTo = (address) => window.location.assign(address) }: { tryApi: TryApi; token: string; madeAt: string; goTo?: (address: string) => void }) {
  const [asking, setAsking] = useState(false);
  // The focus follows the step: to "Șterge definitiv" when the question opens,
  // back to "Șterge" after "Renunță".
  const moved = useRef(false);
  const open = useRef<HTMLButtonElement>(null);
  const confirm = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!moved.current) return;
    moved.current = false;
    (asking ? confirm : open).current?.focus();
  }, [asking]);
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
      // Only the try this device keeps is forgotten and marked: a link opened
      // from elsewhere (an older try, one shared) leaves the device as it is.
      const kept = readStoredTry(window.localStorage, new Date());
      if (kept?.token === token) {
        const earlier = readDeletedAt(window.localStorage);
        if (counted && (earlier === null || Date.parse(earlier) < Date.parse(madeAt))) saveDeletedAt(window.localStorage, madeAt);
        forgetStoredTry(window.localStorage);
      }
      goTo('/');
    },
  });
  if (!asking) {
    return (
      <button
        ref={open}
        type="button"
        className="button-quiet"
        onClick={() => {
          moved.current = true;
          setAsking(true);
        }}
      >
        <svg className="action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
          <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-12M9 7V4h6v3" />
        </svg>
        {t('Șterge')}
      </button>
    );
  }
  return (
    <div className="try-delete-ask" role="group" aria-label={t('Șterge încercarea')}>
      <p className="hint" id="try-delete-question">{t('Sigur? Încercarea, lucrarea și linkul se șterg definitiv.')}</p>
      <div className="try-delete-actions">
        <button ref={confirm} type="button" className="button try-delete-confirm" aria-describedby="try-delete-question" disabled={remove.isPending || remove.isSuccess} onClick={() => remove.mutate()}>
          <ActionIcon name="check" />
          {t('Șterge definitiv')}
        </button>
        <button
          type="button"
          className="button-quiet"
          disabled={remove.isPending}
          onClick={() => {
            remove.reset();
            moved.current = true;
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
