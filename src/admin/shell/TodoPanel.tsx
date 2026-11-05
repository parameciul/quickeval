import { Link } from 'react-router';
import { countLabel } from '../../ui/format.ts';
import { Panel } from './Panel.tsx';
import type { TodoItem } from './todo.ts';

// "Ce ai de făcut" (redesign spec §4): one card per thing that waits on the
// teacher, with one button to its test; the first button is the filled one.
// `others` counts the tests of the year in work that need nothing now.
export function TodoPanel({ items, others, onClose }: { items: TodoItem[]; others: number; onClose(): void }) {
  return (
    <Panel id="panel-todo" title="Ce ai de făcut" onClose={onClose}>
      {items.length === 0 ? (
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
      {others > 0 && (
        <p className="panel-foot">
          {others === 1
            ? 'Celălalt test în lucru nu are nevoie de tine acum.'
            : `Celelalte ${countLabel(others, 'test', 'teste')} în lucru nu au nevoie de tine acum.`}
        </p>
      )}
    </Panel>
  );
}
