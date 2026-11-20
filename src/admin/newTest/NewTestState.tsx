import { missingName, type MissingPart } from '../missing.ts';
import { t } from '../../i18n/t.ts';

// "Starea testului" beside the form of Test nou: what the new test has and
// what it still misses, so the teacher sees where the form stands. A part that
// is not here yet does not block: the test is made all the same.
export function NewTestState({
  hasClass,
  hasTitle,
  missing,
  generating,
  wantsCes,
}: {
  hasClass: boolean;
  hasTitle: boolean;
  missing: MissingPart[];
  // Parts that are not missing because the robot will write them once the test
  // is made: neither here nor missing, so they do not count as done.
  generating: MissingPart[];
  wantsCes: boolean;
}) {
  const parts: MissingPart[] = wantsCes ? ['test', 'barem', 'cesTest', 'cesBarem'] : ['test', 'barem'];
  const items = [
    { key: 'class', label: t('Clasa'), done: hasClass, todo: t('de ales'), doneWord: t('gata'), later: false },
    { key: 'title', label: t('Titlul'), done: hasTitle, todo: t('de scris'), doneWord: t('gata'), later: false },
    ...parts.map((part) => ({
      key: part,
      label: `${missingName(part)[0]?.toUpperCase()}${missingName(part).slice(1)}`,
      done: !missing.includes(part) && !generating.includes(part),
      later: generating.includes(part),
      todo: t('lipsește'),
      doneWord: t('gata'),
    })),
  ];
  const done = items.filter((item) => item.done).length;
  return (
    <section className="class-card new-test-state" aria-labelledby="new-test-state">
      <div className="class-card-head">
        <h2 id="new-test-state">{t('Starea testului')}</h2>
      </div>
      <p className="new-test-count">
        {t('{done} din {length} făcute', { done, length: items.length })}</p>
      <ul>
        {items.map((item) => (
          <li key={item.key} className={item.done ? 'is-done' : item.later ? 'is-later' : 'is-todo'}>
            <span className="state-mark" aria-hidden="true">
              {item.done && (
                <svg
                  viewBox="0 0 20 20"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  focusable="false"
                >
                  <path d="M4.5 10.5l3.5 3.5 7.5-8" />
                </svg>
              )}
            </span>
            <span>{item.label}</span>
            <span className="state-word">{item.done ? item.doneWord : item.later ? t('se va genera') : item.todo}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
