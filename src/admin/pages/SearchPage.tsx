import { useId, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';
import type { SearchResults } from '../../../shared/api.ts';
import { displayClassName } from '../../../shared/classes.ts';
import { formatSchoolYear } from '../../../shared/schoolYear.ts';
import { formatPoints } from '../../../shared/scoring.ts';
import { isSearchable } from '../../../shared/search.ts';
import { countLabel, studentCountLabel } from '../../ui/format.ts';
import { CesTag } from '../CesTag.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';
import { useSchoolYear } from '../SchoolYearContext.tsx';
import { Highlight } from '../search/Highlight.tsx';
import { useSearch } from '../search/useSearch.ts';
import { stagesOf } from '../stages.ts';
import { startedText } from '../testsPage/TestGroup.tsx';

const GROUPS = { students: 'Elevi', classes: 'Clase', tests: 'Teste' } as const;
type GroupName = keyof typeof GROUPS;

function countsOf(results: SearchResults): Record<GroupName, number> {
  return { students: results.students.length, classes: results.classes.length, tests: results.tests.length };
}

// The results page (redesign spec §11.10): everything the search found in the
// school year, one card per group, and chips that show one group. The search
// and the chip live in the address (?q=stef&show=students), so a link or a
// reload keeps them.
export function SearchPage() {
  const [params, setParams] = useSearchParams();
  const { year } = useSchoolYear();
  const text = (params.get('q') ?? '').trim();
  const search = useSearch(text, 0);

  if (!isSearchable(text)) {
    return (
      <section className="search-results">
        <h1>Caută</h1>
        <p className="hint">Scrie cel puțin două litere în caseta de căutare.</p>
      </section>
    );
  }

  // An older answer, kept while the new one comes, is not shown here.
  const results = search.isPlaceholderData ? undefined : search.data;
  const counts = results ? countsOf(results) : null;
  const total = counts ? counts.students + counts.classes + counts.tests : 0;
  // A chip whose group is empty cannot be chosen; an old link to one shows all.
  const asked = params.get('show');
  const show = asked && asked in GROUPS && counts && counts[asked as GroupName] > 0 ? (asked as GroupName) : null;
  const choose = (name: GroupName | null) => {
    const next = new URLSearchParams(params);
    if (name === null) next.delete('show');
    else next.set('show', name);
    setParams(next, { replace: true });
  };
  const shows = (name: GroupName) => (show === null || show === name) && counts !== null && counts[name] > 0;

  return (
    <section className="search-results">
      <h1>Rezultate pentru „{text}”</h1>
      {search.error && <ErrorMessage error={search.error} />}
      {!results && !search.error && <p>Se încarcă…</p>}
      {results && counts && (
        <>
          <p className="hint">
            {total === 0 ? 'Niciun rezultat' : countLabel(total, 'rezultat', 'rezultate')} în anul școlar {formatSchoolYear(year)}. Diacriticele nu contează.
          </p>
          {total > 0 && (
            <div className="chips" role="group" aria-label="Arată">
              <button type="button" className="chip" aria-pressed={show === null} onClick={() => choose(null)}>
                Toate <span className="chip-count">{total}</span>
              </button>
              {(Object.keys(GROUPS) as GroupName[]).map((name) => (
                <button key={name} type="button" className="chip" aria-pressed={show === name} disabled={counts[name] === 0} onClick={() => choose(name)}>
                  {GROUPS[name]} <span className="chip-count">{counts[name]}</span>
                </button>
              ))}
            </div>
          )}
          {shows('students') && (
            <ResultsCard title="Elevi" count={counts.students}>
              {results.students.map((student) => (
                <tr key={student.id}>
                  <th scope="row">
                    <Link to={`/students/${student.id}`}>
                      <Highlight text={student.fullName} query={text} />
                    </Link>
                    {student.ces && <CesTag />}
                  </th>
                  <td>{student.classes.map((cls) => displayClassName(cls.name)).join(', ')}</td>
                  <td className={student.lastGrade === null ? 'num is-muted' : 'num'}>
                    {student.lastGrade === null ? 'nicio notă încă' : `ultima notă ${formatPoints(student.lastGrade)}`}
                  </td>
                </tr>
              ))}
            </ResultsCard>
          )}
          {shows('classes') && (
            <ResultsCard title="Clase" count={counts.classes}>
              {results.classes.map((cls) => (
                <tr key={cls.id}>
                  <th scope="row">
                    <Link to={`/classes/${cls.id}`}>
                      Clasa <Highlight text={cls.name} query={text} />
                    </Link>
                  </th>
                  <td>{studentCountLabel(cls.studentCount)}</td>
                  <td className="num is-muted">{cls.archived ? 'arhivată' : ''}</td>
                </tr>
              ))}
            </ResultsCard>
          )}
          {shows('tests') && (
            <ResultsCard title="Teste" count={counts.tests}>
              {results.tests.map((test) => {
                const { current } = stagesOf(test);
                return (
                  <tr key={test.code}>
                    <th scope="row">
                      <Link to={`/tests/${test.code}`}>
                        <Highlight text={test.title} query={text} />
                      </Link>
                    </th>
                    <td>
                      {displayClassName(test.className)} · {test.archived ? 'arhivat' : startedText(test)}
                    </td>
                    <td className="num">
                      <b>{current.name}</b>
                      {current.note && ` · ${current.note}`}
                    </td>
                  </tr>
                );
              })}
            </ResultsCard>
          )}
          <p className="hint">Cauți în alt an școlar? Alege anul școlar, apoi caută din nou.</p>
        </>
      )}
    </section>
  );
}

function ResultsCard({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  const id = useId();
  return (
    <section className="class-card" aria-labelledby={id}>
      <div className="class-card-head">
        <h2 id={id}>{title}</h2>
        <span>{count}</span>
      </div>
      <div className="table-wrap">
        <table className="search-table" aria-labelledby={id}>
          <tbody>{children}</tbody>
        </table>
      </div>
    </section>
  );
}
