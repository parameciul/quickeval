import type { ClassSummary, TestSummary } from '../../../shared/api.ts';
import { displayClassName } from '../../../shared/classes.ts';
import { classToneStyle } from '../../ui/classTone.ts';
import { countLabel } from '../../ui/format.ts';
import { todoOf } from '../shell/todo.ts';
import { useSmallMenu } from '../shell/useSmallMenu.ts';
import { t } from '../../i18n/t.ts';

// The Teste page's one filter: a button with the chosen class that opens the
// list of the year's classes (each with its colour, a dot when a test waits on
// the teacher, and how many tests it shows), and in its foot the box for the
// archived tests. A choice changes the address, which closes the menu; the
// focus goes back to the button first, so it is not lost with the menu.
export function ClassFilter({
  classes,
  tests,
  chosenClass,
  showArchived,
  onClass,
  onArchived,
}: {
  classes: ClassSummary[];
  tests: TestSummary[];
  chosenClass: number | null;
  showArchived: boolean;
  onClass: (classId: number | null) => void;
  onArchived: (show: boolean) => void;
}) {
  const menu = useSmallMenu();
  const shown = (test: TestSummary) => showArchived || !test.archived;
  const countOf = (classId: number | null) => tests.filter((test) => (classId === null || test.classId === classId) && shown(test)).length;
  const waiting = new Set(tests.filter((test) => todoOf(test) !== null).map((test) => test.classId));
  const archivedCount = tests.filter((test) => test.archived && (chosenClass === null || test.classId === chosenClass)).length;
  const chosen = classes.find((item) => item.id === chosenClass);
  const name = chosen ? displayClassName(chosen.name) : t('Toate clasele');
  const label = showArchived ? t('{name} · cu arhivate', { name }) : name;

  const choose = (act: () => void) => {
    menu.button.current?.focus();
    act();
  };
  const item = (classId: number | null, text: string, muted = false) => (
    <button
      key={classId ?? 'all'}
      type="button"
      className={muted ? 'class-menu-item is-muted' : 'class-menu-item'}
      aria-pressed={classId === chosenClass}
      onClick={() => choose(() => onClass(classId))}
    >
      <span className="class-item-name">
        {classId !== null && <span className="class-dot" style={classToneStyle(classId)} aria-hidden="true" />}
        {text}
      </span>
      <span className="class-menu-note">
        {classId !== null && waiting.has(classId) && <span className="flag-dot" role="img" aria-label={t('te așteaptă')}></span>}
        {countLabel(countOf(classId), 'test', 'teste')}
      </span>
    </button>
  );

  return (
    <div className="class-switch class-filter" ref={menu.box} role="group" aria-label={t('Clasa')}>
      <button
        ref={menu.button}
        type="button"
        className="class-switch-button class-filter-button"
        aria-expanded={menu.open}
        aria-controls={menu.open ? 'class-filter-menu' : undefined}
        onClick={menu.toggle}
      >
        {label}
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 6l4 4 4-4" />
        </svg>
      </button>
      {menu.open && (
        <div className="class-menu class-filter-menu" id="class-filter-menu">
          {item(null, t('Toate clasele'))}
          {classes.map((entry) => item(entry.id, displayClassName(entry.name), entry.archived))}
          <div className="class-menu-foot">
            <label className="check-label">
              <input type="checkbox" checked={showArchived} onChange={(event) => choose(() => onArchived(event.target.checked))} />
              {t('Arată și testele arhivate ({archivedCount})', { archivedCount })}
            </label>
          </div>
        </div>
      )}
    </div>
  );
}
