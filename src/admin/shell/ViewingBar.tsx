import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import type { Viewing } from '../../../shared/api.ts';
import { t } from '../../i18n/t.ts';
import { formatTime } from '../../ui/format.ts';
import { useApi } from '../ApiContext.tsx';
import { beginExit, goToSettings, rememberViewedName } from './viewing.ts';

// The longest delay a timer keeps (a bigger one fires at once).
const MAX_TIMER_MS = 2_147_483_647;

// The bar over the top bar while an administrator views a teacher's account:
// whose account, that it is read only, until when, and the way out.
export function ViewingBar({ viewing, inert }: { viewing: Viewing; inert?: boolean }) {
  const api = useApi();
  const [leaving, setLeaving] = useState(false);
  const name = viewing.teacher.name;
  // A tab that did not start the view still names the account once it ended.
  useEffect(() => rememberViewedName(name), [name]);
  // The server ends the view at this time. The bar asks it once then, instead
  // of leaving on this computer's clock, which may be ahead: a dead view
  // answers 409 and the app leaves; a live one changes nothing.
  const queryClient = useQueryClient();
  const expiresAt = viewing.expiresAt;
  useEffect(() => {
    const wait = Math.min(Math.max(0, Date.parse(expiresAt) - Date.now()), MAX_TIMER_MS);
    const timer = setTimeout(() => void queryClient.refetchQueries({ queryKey: ['version'] }), wait);
    return () => clearTimeout(timer);
  }, [expiresAt, queryClient]);
  const exit = async () => {
    setLeaving(true);
    beginExit();
    try {
      await api.endView();
    } catch {
      // A view that is gone already, or no network: Setări is the way out all the same.
    }
    goToSettings(false);
  };
  return (
    <div className="viewing-bar" role="region" aria-label={t('Vezi contul unui profesor')} inert={inert}>
      <p>{t('Vezi contul lui {name} · doar citire · până la {time}', { name, time: formatTime(viewing.expiresAt) })}</p>
      <button type="button" disabled={leaving} onClick={() => void exit()}>
        {t('Ieși din vizualizare')}
      </button>
    </div>
  );
}
