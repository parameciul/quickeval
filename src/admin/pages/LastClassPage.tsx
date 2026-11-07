import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { useApi } from '../ApiContext.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';
import { useSchoolYear } from '../SchoolYearContext.tsx';

// The key that remembers which class the teacher opened last, so /clase reopens it.
const LAST_CLASS_KEY = 'quickeval:lastClass';

// /clase: opens the last class the teacher saw (else the first one of the year),
// instead of showing a page with all classes (redesign spec §9).
export function LastClassPage() {
  const api = useApi();
  const { year } = useSchoolYear();
  const navigate = useNavigate();
  const classes = useQuery({ queryKey: ['classes', year], queryFn: () => api.listClasses(year) });

  useEffect(() => {
    if (!classes.data) return;
    const list = classes.data.filter((item) => !item.archived);
    if (list.length === 0) return;
    const saved = localStorage.getItem(LAST_CLASS_KEY);
    const target = list.find((item) => item.id === Number(saved)) ?? list[0];
    localStorage.setItem(LAST_CLASS_KEY, String(target!.id));
    navigate(`/clase/${target!.id}`, { replace: true });
  }, [classes.data, navigate]);

  if (!classes.data) return <p>Se încarcă…</p>;
  if (classes.error) return <ErrorMessage error={classes.error} />;
  if (classes.data.length === 0) return <p className="hint">Nu ai nicio clasă în acest an școlar.</p>;
  return null;
}
