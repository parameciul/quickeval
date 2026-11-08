import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { displayClassName } from '../../../shared/classes.ts';
import { useApi } from '../ApiContext.tsx';
import { EmptyState } from '../EmptyState.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';
import { IconClasses } from '../shell/icons.tsx';
import { useSchoolYear } from '../SchoolYearContext.tsx';
import { NewClassDialog } from '../classPage/ClassDialogs.tsx';
import type { ClassLinkState } from './ClassPage.tsx';

// The key that remembers which class the teacher opened last, so /clase reopens it.
const LAST_CLASS_KEY = 'quickeval:lastClass';

// /clase: opens the last class the teacher saw (else the first one of the year),
// instead of showing a page with all classes (redesign spec §9). What a link
// asks for (state `newClass` or `archived`) goes on to that class page. With no
// active class, the page is an empty state with "Clasă nouă", and lists the
// archived classes under it.
export function LastClassPage() {
  const api = useApi();
  const { year } = useSchoolYear();
  const navigate = useNavigate();
  const location = useLocation();
  const [linkState] = useState(() => location.state as ClassLinkState);
  const [newClassOpen, setNewClassOpen] = useState(linkState?.newClass === true);
  const classes = useQuery({ queryKey: ['classes', year], queryFn: () => api.listClasses(year) });

  useEffect(() => {
    if (!classes.data) return;
    const list = classes.data.filter((item) => !item.archived);
    if (list.length === 0) return;
    const saved = localStorage.getItem(LAST_CLASS_KEY);
    const target = list.find((item) => item.id === Number(saved)) ?? list[0];
    localStorage.setItem(LAST_CLASS_KEY, String(target!.id));
    navigate(`/clase/${target!.id}`, { replace: true, state: linkState });
  }, [classes.data, navigate, linkState]);

  if (classes.error) return <ErrorMessage error={classes.error} />;
  if (!classes.data) return <p>Se încarcă…</p>;
  if (classes.data.some((item) => !item.archived)) return null;
  const archived = classes.data.filter((item) => item.archived);
  return (
    <div className="class-card">
      <EmptyState
        icon={<IconClasses />}
        title={archived.length === 0 ? 'Încă nu ai nicio clasă' : 'Nu ai nicio clasă activă'}
        level={1}
        action={
          <button type="button" className="button button-small" onClick={() => setNewClassOpen(true)}>
            + Clasă nouă
          </button>
        }
      >
        Adaugă clasa cu numele elevilor, câte unul pe rând.
      </EmptyState>
      {archived.length > 0 && (
        <p className="class-card-foot class-empty-archived">
          Arhivate:{' '}
          {archived.map((item, index) => (
            <span key={item.id}>
              {index > 0 && ', '}
              <Link to={`/clase/${item.id}`}>{displayClassName(item.name)}</Link>
            </span>
          ))}
        </p>
      )}
      {newClassOpen && <NewClassDialog onClose={() => setNewClassOpen(false)} />}
    </div>
  );
}
