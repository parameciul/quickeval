import { Link } from 'react-router';
import { countLabel } from '../../ui/format.ts';
import { ErrorMessage } from '../ErrorMessage.tsx';
import { Panel } from './Panel.tsx';
import { todoPath, type TodoItem } from './todo.ts';

// The line under the cards: the tests of the year in work that need nothing
// now ("the other" ones only when a card stands above it).
function othersLine(others: number, alone: boolean): string {
  if (alone) {
    return others === 1
      ? 'Testul în lucru nu are nevoie de tine acum.'
      : `Cele ${countLabel(others, 'test', 'teste')} în lucru nu au nevoie de tine acum.`;
  }
  return others === 1
    ? 'Celălalt test în lucru nu are nevoie de tine acum.'
    : `Celelalte ${countLabel(others, 'test', 'teste')} în lucru nu au nevoie de tine acum.`;
}

// "Ce ai de făcut" (redesign spec §4): one card per thing that waits on the
// teacher, with one button to its test; the first button is the filled one.
// `others` counts the tests of the year in work that need nothing now. Until
// the tests of the year arrive it says so, or why they could not be read.
export function TodoPanel({
  items,
  approvals,
  others,
  loading,
  error,
  onClose,
}: {
  items: TodoItem[];
  // Accounts that wait for an administrator's approval; 0 for a teacher.
  approvals: number;
  others: number;
  loading: boolean;
  error: unknown;
  onClose(): void;
}) {
  const ready = !loading && !error;
  return (
    <Panel id="panel-todo" title="Ce ai de făcut" onClose={onClose}>
      {error ? (
        <div className="panel-body">
          <ErrorMessage error={error} />
        </div>
      ) : loading ? (
        <p className="panel-body hint">Se încarcă…</p>
      ) : items.length === 0 && approvals === 0 ? (
        <p className="panel-body hint">Nimic nu te așteaptă acum.</p>
      ) : (
        <ol className="todo-list">
          {approvals > 0 && (
            <li className="todo-card todo-urgent">
              <p className="todo-test">
                <span className="tag tag-urgent">Urgent</span>
                Administrator
              </p>
              <h3>{approvals === 1 ? 'Un cont nou așteaptă aprobarea' : `${approvals} conturi noi așteaptă aprobarea`}</h3>
              <p className="todo-text">Profesorul și-a confirmat emailul. Până aprobi contul, nu se poate conecta.</p>
              <Link className="button button-small" to="/setari" aria-label="Deschide Setări: conturi de aprobat">
                Deschide
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
