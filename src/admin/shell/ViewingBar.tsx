import { useEffect, useState } from 'react';
import type { Viewing } from '../../../shared/api.ts';
import { t } from '../../i18n/t.ts';
import { formatTime } from '../../ui/format.ts';
import { useApi } from '../ApiContext.tsx';
import { goToSettings, rememberViewedName } from './viewing.ts';

// The bar over the top bar while an administrator views a teacher's account:
// whose account, that it is read only, until when, and the way out.
export function ViewingBar({ viewing, inert }: { viewing: Viewing; inert?: boolean }) {
  const api = useApi();
  const [leaving, setLeaving] = useState(false);
  const name = viewing.teacher.name;
  // A tab that did not start the view still names the account once it ended.
  useEffect(() => rememberViewedName(name), [name]);
  // The server ends the view at this time; the bar does not wait for the next
  // check to leave.
  const expiresAt = viewing.expiresAt;
  useEffect(() => {
    const timer = setTimeout(() => goToSettings(true), Math.max(0, Date.parse(expiresAt) - Date.now()));
    return () => clearTimeout(timer);
  }, [expiresAt]);
  const exit = async () => {
    setLeaving(true);
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
