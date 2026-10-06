import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import type { ClassSummary } from '../../../shared/api.ts';
import { displayClassName } from '../../../shared/classes.ts';
import { formatSchoolYear } from '../../../shared/schoolYear.ts';
import { studentCountLabel } from '../../ui/format.ts';
import { useApi } from '../ApiContext.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';
import { useSchoolYear } from '../SchoolYearContext.tsx';

export function ClassesPage() {
  const api = useApi();
  const queryClient = useQueryClient();
  const { year } = useSchoolYear();
  const [name, setName] = useState('');

  const classes = useQuery({ queryKey: ['classes', year], queryFn: () => api.listClasses(year) });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['classes', year] });

  const create = useMutation({
    mutationFn: () => api.createClass({ name, schoolYear: year }),
    onSuccess: async () => {
      setName('');
      await refresh();
    },
  });

  const archive = useMutation({
    mutationFn: (item: ClassSummary) => api.updateClass(item.id, { archived: !item.archived }),
    onSuccess: refresh,
  });

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    create.mutate();
  };

  return (
    <section>
      <h1>Clase {formatSchoolYear(year)}</h1>

      <form className="form-row" onSubmit={onSubmit}>
        <label htmlFor="class-name">Clasă nouă</label>
        <input
          id="class-name"
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="de exemplu 6E2"
          maxLength={20}
          required
        />
        <button className="button" type="submit" disabled={create.isPending}>
          Adaugă clasa
        </button>
      </form>
      {create.error && <ErrorMessage error={create.error} />}
      {archive.error && <ErrorMessage error={archive.error} />}

      {classes.isPending && <p>Se încarcă…</p>}
      {classes.error && <ErrorMessage error={classes.error} />}
      {classes.data && classes.data.length === 0 && <p className="hint">Nu ai nicio clasă în acest an școlar.</p>}
      {classes.data && classes.data.length > 0 && (
        <ul className="card-list">
          {classes.data.map((item) => (
            <li key={item.id} className={item.archived ? 'card is-muted' : 'card'}>
              <Link className="card-title" to={`/clase/${item.id}`}>
                {displayClassName(item.name)}
              </Link>
              <span>{studentCountLabel(item.studentCount)}</span>
              {item.archived && <span className="tag">Arhivată</span>}
              <span>
                <button
                  type="button"
                  className="button-quiet button-small"
                  onClick={() => archive.mutate(item)}
                  disabled={archive.isPending}
                >
                  {item.archived ? 'Scoate din arhivă' : 'Arhivează'}
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
