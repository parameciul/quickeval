import { Link } from 'react-router';
import { countLabel } from '../../ui/format.ts';
import { ErrorMessage } from '../ErrorMessage.tsx';
import { Panel } from './Panel.tsx';
import type { TodoItem } from './todo.ts';

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
  others,
  loading,
  error,
  onClose,
}: {
  items: TodoItem[];
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
      ) : items.length === 0 ? (
        <p className="panel-body hint">Nimic nu te așteaptă acum.</p>
      ) : (
        <ol className="todo-list">
          {items.map((item, index) => (
            <li key={item.code} className="todo-card">
              <p className="todo-test">
                <span className="tag tag-wait">{item.stage}</span>
                {item.testTitle} · {item.className}
              </p>
              <h3>{item.task}</h3>
              <p className="todo-text">{item.text}</p>
              <Link
                className={index === 0 ? 'button button-small' : 'button-quiet button-small'}
                to={`/teste/${item.code}`}
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
