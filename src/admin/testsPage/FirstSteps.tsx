import { useState } from 'react';
import { Link } from 'react-router';
import { NewClassDialog } from '../classPage/ClassDialogs.tsx';
import { IconDone } from '../shell/icons.tsx';
import { ActionIcon } from '../../ui/ActionIcon.tsx';
import { t } from '../../i18n/t.ts';

// "Primii pași" of a new teacher's Teste page (redesign spec §11.9): add a
// class, make a test, print it with the QR code. The class is the only step
// that can be done while the card shows (it goes once a test exists): a tick,
// and "Test nou" turns on.
export function FirstSteps({ hasClass }: { hasClass: boolean }) {
  const [newClassOpen, setNewClassOpen] = useState(false);
  return (
    <section className="class-card first-steps" aria-labelledby="first-steps">
      <div className="class-card-head">
        <h2 id="first-steps">{t('Primii pași')}</h2>
        <span>{hasClass ? 1 : 0}{' '}{t('din 3')}</span>
      </div>
      <ol className="first-steps-list">
        <li className={hasClass ? 'is-done' : 'is-now'}>
          <span className="first-step-mark" aria-hidden="true">
            {hasClass ? <IconDone /> : 1}
          </span>
          <h3>
            {t('Adaugă o clasă')}{hasClass && ' '}
            {hasClass && <span className="sr-only">{t('gata')}</span>}
          </h3>
          <p>{t('Numele clasei și elevii, câte unul pe rând. Poți lipi lista din catalog.')}</p>
          {!hasClass && (
            <button type="button" className="button button-small" onClick={() => setNewClassOpen(true)}>
              <ActionIcon name="add" />
              {t('Clasă nouă')}
            </button>
          )}
        </li>
        <li className={hasClass ? 'is-now' : undefined}>
          <span className="first-step-mark" aria-hidden="true">
            2
          </span>
          <h3>{t('Fă un test')}</h3>
          <p>{t('Încarci testul și baremul. Nu ai un barem pregătit? Generezi automat baremul din test, iar apoi îl poți revizui și ajusta.')}</p>
          {hasClass ? (
            <Link className="button button-small" to="/tests/new">
              <ActionIcon name="add" />
              {t('Test nou')}
            </Link>
          ) : (
            <button type="button" className="button-quiet button-small" disabled>
              <ActionIcon name="add" />
              {t('Test nou')}
            </button>
          )}
        </li>
        <li>
          <span className="first-step-mark" aria-hidden="true">
            3
          </span>
          <h3>{t('Tipărește-l cu cod QR')}</h3>
          <p>{t('Elevii scanează codul și trimit pozele lucrării. Fără cont și fără aplicație.')}</p>
        </li>
      </ol>
      {newClassOpen && <NewClassDialog onClose={() => setNewClassOpen(false)} />}
    </section>
  );
}
