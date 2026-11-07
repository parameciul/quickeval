import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { useApi } from '../ApiContext.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';
import { useSchoolYear } from '../SchoolYearContext.tsx';
import { NewClassDialog } from '../classPage/ClassDialogs.tsx';
import type { NewClassState } from './ClassPage.tsx';

// The key that remembers which class the teacher opened last, so /clase reopens it.
const LAST_CLASS_KEY = 'quickeval:lastClass';

// /clase: opens the last class the teacher saw (else the first one of the year),
// instead of showing a page with all classes (redesign spec §9). A link that
// asks for "Clasă nouă" (state `newClass`) gets the dialog on that class page,
// or here when the year has no class yet.
export function LastClassPage() {
  const api = useApi();
  const { year } = useSchoolYear();
  const navigate = useNavigate();
  const location = useLocation();
  const askedNew = (location.state as NewClassState)?.newClass === true;
  const [newClassOpen, setNewClassOpen] = useState(askedNew);
  const classes = useQuery({ queryKey: ['classes', year], queryFn: () => api.listClasses(year) });

  useEffect(() => {
    if (!classes.data) return;
    const list = classes.data.filter((item) => !item.archived);
    if (list.length === 0) return;
    const saved = localStorage.getItem(LAST_CLASS_KEY);
    const target = list.find((item) => item.id === Number(saved)) ?? list[0];
    localStorage.setItem(LAST_CLASS_KEY, String(target!.id));
    navigate(`/clase/${target!.id}`, { replace: true, state: askedNew ? { newClass: true } : null });
  }, [classes.data, navigate, askedNew]);

  if (classes.error) return <ErrorMessage error={classes.error} />;
  if (!classes.data) return <p>Se încarcă…</p>;
  if (classes.data.some((item) => !item.archived)) return null;
  return (
    <div className="class-card class-empty">
      <p>Nu ai nicio clasă în acest an școlar.</p>
      <button type="button" className="button button-small" onClick={() => setNewClassOpen(true)}>
        + Clasă nouă
      </button>
      {newClassOpen && <NewClassDialog onClose={() => setNewClassOpen(false)} />}
    </div>
  );
}
