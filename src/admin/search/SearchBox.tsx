import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import type { SearchResults } from '../../../shared/api.ts';
import { displayClassName } from '../../../shared/classes.ts';
import { isSearchable } from '../../../shared/search.ts';
import { studentCountLabel } from '../../ui/format.ts';
import { IconSearch } from '../shell/icons.tsx';
import { startedText } from '../testsPage/TestGroup.tsx';
import { Highlight } from './Highlight.tsx';
import { useSearch } from './useSearch.ts';

// How many of each group the list under the box shows; the results page
// shows them all.
export const SHOWN_PER_GROUP = 5;

export const SEARCH_LABEL = 'Caută elevi, clase și teste';

interface Option {
  to: string;
  name: ReactNode;
  meta?: string;
}

interface Group {
  title: string;
  options: Option[];
}

// The address of the results page for a search.
export function resultsPath(text: string): string {
  return `/cautare?q=${encodeURIComponent(text.trim())}`;
}

function groupsOf(results: SearchResults, text: string): Group[] {
  const groups: Group[] = [
    {
      title: 'Elevi',
      options: results.students.slice(0, SHOWN_PER_GROUP).map((student) => ({
        to: `/elevi/${student.id}`,
        name: <Highlight text={student.fullName} query={text} />,
        meta: student.classes.map((cls) => displayClassName(cls.name)).join(', '),
      })),
    },
    {
      title: 'Clase',
      options: results.classes.slice(0, SHOWN_PER_GROUP).map((cls) => ({
        to: `/clase/${cls.id}`,
        name: (
          <>
            Clasa <Highlight text={cls.name} query={text} />
          </>
        ),
        meta: cls.archived ? `${studentCountLabel(cls.studentCount)} · arhivată` : studentCountLabel(cls.studentCount),
      })),
    },
    {
      title: 'Teste',
      options: results.tests.slice(0, SHOWN_PER_GROUP).map((test) => ({
        to: `/teste/${test.code}`,
        name: <Highlight text={test.title} query={text} />,
        meta: `${displayClassName(test.className)} · ${test.archived ? 'arhivat' : startedText(test)}`,
      })),
    },
  ];
  return groups.filter((group) => group.options.length > 0);
}

// The search box (redesign spec §11.10): typing opens a list under it,
// grouped "Elevi", "Clase", "Teste", and "Toate rezultatele" last. The arrows
// move, Enter opens the chosen line or, with none chosen, the results page.
// In the phone's search over the whole screen (`always`) the list stays open.
export function SearchBox({ id, always = false }: { id: string; always?: boolean }) {
  const navigate = useNavigate();
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const box = useRef<HTMLDivElement>(null);
  const search = useSearch(text);
  const ready = isSearchable(text);
  const shown = ready && (always || open);
  const groups = ready && search.data ? groupsOf(search.data, text) : [];
  // With nothing found the list says so, and has no line to choose.
  const empty = search.data !== undefined && groups.length === 0;
  const all: Option = { to: resultsPath(text), name: `Toate rezultatele pentru „${text.trim()}”` };
  const options: Option[] = ready && !empty ? [...groups.flatMap((group) => group.options), all] : [];
  const listed = shown && options.length > 0;
  const listId = `${id}-list`;
  const optionId = (index: number) => `${id}-option-${index}`;

  useEffect(() => {
    if (active >= 0) document.getElementById(optionId(active))?.scrollIntoView?.({ block: 'nearest' });
  });

  const go = (to: string) => {
    setOpen(false);
    setActive(-1);
    if (!to.startsWith('/cautare')) setText('');
    void navigate(to);
  };

  const onKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (options.length === 0) return;
      event.preventDefault();
      setOpen(true);
      const last = options.length - 1;
      if (event.key === 'ArrowDown') setActive(active >= last ? 0 : active + 1);
      else setActive(active <= 0 ? last : active - 1);
    } else if (event.key === 'Enter') {
      if (!ready) return;
      event.preventDefault();
      go(options[active]?.to ?? resultsPath(text));
    } else if (event.key === 'Escape' && shown && !always) {
      // The list closes first; the next Esc reaches the page (a panel).
      event.preventDefault();
      setOpen(false);
      setActive(-1);
    }
  };

  let index = -1;
  const optionOf = (option: Option, className = 'search-item') => {
    index += 1;
    const at = index;
    return (
      <div
        key={option.to}
        id={optionId(at)}
        role="option"
        aria-selected={at === active}
        className={at === active ? `${className} is-active` : className}
        // The focus stays in the box; the click opens the line.
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => go(option.to)}
      >
        <span className="search-item-name">{option.name}</span>
        {option.meta && (
          <>
            <span className="sr-only">,</span> <span className="search-item-meta">{option.meta}</span>
          </>
        )}
      </div>
    );
  };

  return (
    <div
      ref={box}
      className={always ? 'search search-always' : 'search'}
      role="search"
      onBlur={(event) => {
        if (!box.current?.contains(event.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <IconSearch />
      <input
        type="text"
        role="combobox"
        aria-label={SEARCH_LABEL}
        placeholder={SEARCH_LABEL}
        aria-autocomplete="list"
        aria-expanded={shown}
        aria-controls={listed ? listId : undefined}
        aria-activedescendant={listed && active >= 0 ? optionId(active) : undefined}
        autoComplete="off"
        spellCheck={false}
        maxLength={80}
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKey}
      />
      {shown && (
        <div className="search-pop">
          {empty && <p className="search-none">Nimic găsit în acest an școlar.</p>}
          {search.error && !search.data && <p className="search-none">Căutarea nu a mers. Încearcă din nou.</p>}
          {listed && (
            <div id={listId} role="listbox" aria-label={`Rezultate pentru „${text.trim()}”`}>
              {groups.map((group) => (
                <div key={group.title} role="group" aria-labelledby={`${id}-${group.title}`} className="search-group">
                  <div id={`${id}-${group.title}`} role="presentation" className="search-group-title">
                    {group.title}
                  </div>
                  {group.options.map((option) => optionOf(option))}
                </div>
              ))}
              {optionOf(all, 'search-item search-all')}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
