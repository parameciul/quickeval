import { Link } from 'react-router';
import { countLabel } from '../../ui/format.ts';
import { EmptyState } from '../EmptyState.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';
import { IconDone } from './icons.tsx';
import { Panel } from './Panel.tsx';
import { todoPath, type TodoItem } from './todo.ts';
import { ActionIcon, actionIconFor } from '../../ui/ActionIcon.tsx';
import { t } from '../../i18n/t.ts';

// The line under the cards: the tests of the year in work that need nothing
// now ("the other" ones only when a card stands above it).
function othersLine(others: number, alone: boolean): string {
  if (alone) {
    return others === 1
      ? t('Testul în lucru nu are nevoie de tine acum.')
      : t('Cele {countLabel} în lucru nu au nevoie de tine acum.', { countLabel: countLabel(others, 'test', 'teste') });
  }
  return others === 1
    ? t('Celălalt test în lucru nu are nevoie de tine acum.')
    : t('Celelalte {countLabel} în lucru nu au nevoie de tine acum.', { countLabel: countLabel(others, 'test', 'teste') });
}

// "Ce ai de făcut" (redesign spec §4): one card per thing that waits on the
// teacher, with one button to its test; the first button is the filled one.
// `others` counts the tests of the year in work that need nothing now. Until
// the tests of the year arrive it says so, or why they could not be read.
// For an administrator the empty sentence names the new accounts too.
export function TodoPanel({
  items,
  admin,
  approvals,
  others,
  loading,
  error,
  onClose,
}: {
  items: TodoItem[];
  admin: boolean;
  // Accounts that wait for an administrator's approval; 0 for a teacher.
  approvals: number;
  others: number;
  loading: boolean;
  error: unknown;
  onClose(): void;
}) {
  const ready = !loading && !error;
  return (
    <Panel id="panel-todo" title={t('Ce ai de făcut')} onClose={onClose}>
      {error ? (
        <div className="panel-body">
          <ErrorMessage error={error} />
        </div>
      ) : loading ? (
        <p className="panel-body hint">{t('Se încarcă…')}</p>
      ) : items.length === 0 && approvals === 0 ? (
        <EmptyState icon={<IconDone />} title={t('Nimic nu te așteaptă acum')}>
          {admin
            ? t('Când un barem, un punct nesigur, niște rezultate sau un cont nou au nevoie de tine, apar aici.')
            : t('Când un barem, un punct nesigur sau niște rezultate au nevoie de tine, apar aici.')}
        </EmptyState>
      ) : (
        <ol className="todo-list">
          {approvals > 0 && (
            <li className="todo-card todo-urgent">
              <p className="todo-test">
                <span className="tag tag-urgent">{t('Urgent')}</span>
                {t('Administrator')}
              </p>
              <h3>{approvals === 1 ? t('Un cont nou așteaptă aprobarea') : t('{approvals} conturi noi așteaptă aprobarea', { approvals })}</h3>
              <p className="todo-text">{t('Profesorul și-a confirmat emailul. Până aprobi contul, nu se poate conecta.')}</p>
              <Link className="button button-small" to="/settings" aria-label={t('Deschide Setări: conturi de aprobat')}>
                <ActionIcon name="open" />
                {t('Deschide')}
              </Link>
            </li>
          )}
          {items.map((item, index) => (
            <li key={item.code} className="todo-card">
              <p className="todo-test">
                <span className="tag tag-wait">{item.stage}</span>
                {item.testTitle} · {item.className}
              </p>
              <h3>{item.task}</h3>
              <p className="todo-text">{item.text}</p>
              <Link
                className={index === 0 && approvals === 0 ? 'button button-small' : 'button-quiet button-small'}
                to={todoPath(item)}
                aria-label={`${item.action}: ${item.testTitle}, ${item.className}`}
              >
                <ActionIcon name={actionIconFor(item.action)} />
                {item.action}
              </Link>
            </li>
          ))}
        </ol>
      )}
      {ready && others > 0 && <p className="panel-foot">{othersLine(others, items.length === 0)}</p>}
    </Panel>
  );
}
