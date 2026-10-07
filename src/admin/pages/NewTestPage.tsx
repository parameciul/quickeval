import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { displayClassName } from '../../../shared/classes.ts';
import type { TestFileKind } from '../../../shared/files.ts';
import { formatSchoolYear } from '../../../shared/schoolYear.ts';
import { MAX_TITLE_LENGTH } from '../../../shared/tests.ts';
import { useApi } from '../ApiContext.tsx';
import { ErrorMessage, errorText } from '../ErrorMessage.tsx';
import { useSchoolYear } from '../SchoolYearContext.tsx';
import { TestFileInput } from '../TestFileInput.tsx';

// /teste/nou: class and title; the test and the barem can come now or later.
// ?clasa=<id> picks the class (the class page links here).
export function NewTestPage() {
  const api = useApi();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { year } = useSchoolYear();
  const [params] = useSearchParams();
  const classes = useQuery({ queryKey: ['classes', year], queryFn: () => api.listClasses(year) });
  const [classId, setClassId] = useState(params.get('clasa') ?? '');
  const [title, setTitle] = useState('');
  const [files, setFiles] = useState<Record<TestFileKind, File | null>>({ test: null, barem: null });

  const create = useMutation({
    mutationFn: async () => {
      const code = await api.createTest({ classId: Number(classId), title });
      // The test exists now. A file that fails to upload can be sent again from the test page.
      let notice: string | null = null;
      for (const kind of ['test', 'barem'] as const) {
        const file = files[kind];
        if (!file) continue;
        try {
          await api.uploadTestFile(code, kind, file);
        } catch (err) {
          notice ??= `Testul a fost creat, dar fișierul ${file.name} nu s-a încărcat: ${errorText(err)}`;
        }
      }
      return { code, notice };
    },
    onSuccess: async ({ code, notice }) => {
      await queryClient.invalidateQueries({ queryKey: ['tests'] });
      navigate(`/teste/${code}`, { state: notice ? { notice } : null });
    },
  });

  const open = classes.data?.filter((item) => !item.archived) ?? [];
  const selected = open.some((item) => String(item.id) === classId) ? classId : '';

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    create.mutate();
  };

  return (
    <section>
      <p>
        <Link to="/">← Toate testele</Link>
      </p>
      <h1>Test nou</h1>

      {classes.isPending && <p>Se încarcă…</p>}
      {classes.error && <ErrorMessage error={classes.error} />}
      {classes.data && open.length === 0 && (
        <p className="hint">
          Nu ai nicio clasă în anul școlar {formatSchoolYear(year)}. <Link to="/clase">Adaugă întâi o clasă.</Link>
        </p>
      )}
      {open.length > 0 && (
        <form className="form-stack narrow" onSubmit={onSubmit}>
          <label htmlFor="test-class">Clasa</label>
          <select id="test-class" value={selected} onChange={(event) => setClassId(event.target.value)} required>
            <option value="">Alege clasa</option>
            {open.map((item) => (
              <option key={item.id} value={item.id}>
                {displayClassName(item.name)}
              </option>
            ))}
          </select>

          <label htmlFor="test-title">Titlul testului</label>
          <input
            id="test-title"
            type="text"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="de exemplu Test de evaluare inițială"
            maxLength={MAX_TITLE_LENGTH}
            required
          />

          <TestFileInput
            id="new-test-file"
            label="Testul (PDF sau Word, opțional)"
            onPick={(file) => setFiles((current) => ({ ...current, test: file }))}
          />
          <TestFileInput
            id="new-barem-file"
            label="Baremul (PDF sau Word, opțional)"
            onPick={(file) => setFiles((current) => ({ ...current, barem: file }))}
          />

          <span>
            <button className="button" type="submit" disabled={create.isPending || selected === ''}>
              {create.isPending ? 'Se creează…' : 'Creează testul'}
            </button>
          </span>
          {create.error && <ErrorMessage error={create.error} />}
        </form>
      )}
    </section>
  );
}
