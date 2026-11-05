import { Link } from 'react-router';
import { displayClassName } from '../../../shared/classes.ts';
import type { TodoItem } from '../shell/todo.ts';

// "Ce ai de făcut" in place on the Teste page (redesign spec §5): one row per
// thing that waits, with one button to its test; the first is the filled one.
export function TodoRows({ id, items, hidden }: { id: string; items: TodoItem[]; hidden: boolean }) {
  return (
    <section id={id} className="todo-inline" aria-label="Ce ai de făcut" hidden={hidden}>
      <ol className="todo-rows">
        {items.map((item, index) => {
          const where = `${item.testTitle}, ${displayClassName(item.className)}`;
          return (
            <li key={item.code}>
              <div className="what">
                <b>
                  <span className="tag tag-wait">{item.stage}</span>
                  {item.task}
                </b>
                <span>
                  {item.testTitle} · {displayClassName(item.className)}
                </span>
              </div>
              <Link
                className={index === 0 ? 'button button-small' : 'button-quiet button-small'}
                to={`/teste/${item.code}`}
                aria-label={`${item.action}: ${where}`}
              >
                {item.action}
              </Link>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
