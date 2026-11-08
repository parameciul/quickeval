import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { displayClassName } from '../../../shared/classes.ts';
import { formatSchoolYear } from '../../../shared/schoolYear.ts';
import { MAX_TITLE_LENGTH } from '../../../shared/tests.ts';
import { useApi } from '../ApiContext.tsx';
import { NewClassDialog } from '../classPage/ClassDialogs.tsx';
import { ErrorMessage, errorText } from '../ErrorMessage.tsx';
import { FileDrop } from '../newTest/FileDrop.tsx';
import { useSchoolYear } from '../SchoolYearContext.tsx';

// Where the barem comes from: a file now, the robot from the test, or later.
type BaremChoice = 'upload' | 'generate' | 'later';

// /teste/nou (redesign spec §11.7): three numbered steps, the class and the
// title, the test, and the barem, with what happens next on the side.
// ?clasa=<id> picks the class (the class page links here). The test and the
// barem can come now or later; the test page holds them too.
export function NewTestPage() {
  const api = useApi();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { year } = useSchoolYear();
  const [params] = useSearchParams();
  const classes = useQuery({ queryKey: ['classes', year], queryFn: () => api.listClasses(year) });
  const [classId, setClassId] = useState(params.get('clasa') ?? '');
  const [title, setTitle] = useState('');
  const [testFile, setTestFile] = useState<File | null>(null);
  const [baremFile, setBaremFile] = useState<File | null>(null);
  const [barem, setBarem] = useState<BaremChoice>('upload');
  const [newClass, setNewClass] = useState(false);

  const create = useMutation({
    mutationFn: async () => {
      const code = await api.createTest({ classId: Number(classId), title });
      // The test exists now. What fails next can be done again from the test
      // page, so the teacher goes there with a notice.
      let notice: string | null = null;
      const send = async (file: File, kind: 'test' | 'barem') => {
        try {
          await api.uploadTestFile(code, kind, file);
          return true;
        } catch (err) {
          notice ??= `Testul a fost creat, dar fișierul ${file.name} nu s-a încărcat: ${errorText(err)}`;
          return false;
        }
      };
      const testSent = testFile !== null && (await send(testFile, 'test'));
      if (barem === 'upload' && baremFile) await send(baremFile, 'barem');
      // The robot writes the barem from the test file, so only once it is sent.
      if (barem === 'generate' && testSent) {
        try {
          await api.generateBarem(code);
        } catch (err) {
          notice ??= `Testul a fost creat, dar baremul nu s-a putut genera: ${errorText(err)}`;
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

  // Without the test there is nothing to generate the barem from.
  const pickTest = (file: File | null) => {
    setTestFile(file);
    if (file === null && barem === 'generate') setBarem('later');
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    create.mutate();
  };

  const choice = (value: BaremChoice, label: string, line: string, extra?: string) => (
    <label className="choice">
      <input
        type="radio"
        name="barem"
        value={value}
        checked={barem === value}
        disabled={value === 'generate' && testFile === null}
        onChange={() => setBarem(value)}
      />
      <span>
        <b>{label}</b>
        <span>{line}</span>
        {extra && <span className="choice-extra">{extra}</span>}
      </span>
    </label>
  );

  return (
    <section>
      <p className="back-link">
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
        <div className="new-test">
          <form onSubmit={onSubmit}>
            <ol className="steps">
              <li className="step">
                <div>
                  <h2>Clasa și titlul</h2>
                  <p>Titlul îl văd și elevii, pe pagina lor.</p>
                  <div className="form-field">
                    <label htmlFor="test-class">Clasa</label>
                    <select id="test-class" value={selected} onChange={(event) => setClassId(event.target.value)} required>
                      <option value="">Alege clasa</option>
                      {open.map((item) => (
                        <option key={item.id} value={item.id}>
                          {displayClassName(item.name)}
                        </option>
                      ))}
                    </select>
                    {params.get('clasa') === null && (
                      <span className="form-hint">
                        Nu e în listă?{' '}
                        <button type="button" className="link-button" onClick={() => setNewClass(true)}>
                          Clasă nouă
                        </button>
                      </span>
                    )}
                  </div>
                  <div className="form-field">
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
                  </div>
                </div>
              </li>
              <li className="step">
                <div>
                  <h2>Testul</h2>
                  <p>Fișierul pe care îl tipărești. PDF sau Word. Poți să-l adaugi și mai târziu.</p>
                  <FileDrop id="new-test-file" name="Fișierul testului" onPick={pickTest} />
                </div>
              </li>
              <li className="step">
                <div>
                  <h2>Baremul</h2>
                  <p>După el se dă punctajul.</p>
                  <fieldset className="choices">
                    <legend className="sr-only">Baremul</legend>
                    {choice('upload', 'Încarc baremul acum', 'PDF sau Word.')}
                    {/* Kept while another choice is made, so the file comes back with it. */}
                    <div className="choice-drop" hidden={barem !== 'upload'}>
                      <FileDrop id="new-barem-file" name="Fișierul baremului" onPick={setBaremFile} />
                    </div>
                    {choice(
                      'generate',
                      'Generează baremul din test',
                      'Primești o propunere în câteva minute. O verifici și o confirmi înainte de corectare.',
                      testFile === null ? 'Alege întâi testul, la pasul 2.' : undefined,
                    )}
                    {choice('later', 'Mai târziu', 'Îl adaugi din pagina testului, la Pregătire. Corectarea nu începe fără barem.')}
                  </fieldset>
                </div>
              </li>
            </ol>
            <div className="new-test-foot">
              <button className="button button-big" type="submit" disabled={create.isPending || selected === ''}>
                {create.isPending ? 'Se creează…' : 'Creează testul'}
              </button>
              <span className="form-hint">Testul rămâne ciornă până apeși „Începe testul”.</span>
            </div>
            {create.error && <ErrorMessage error={create.error} />}
          </form>

          <section className="class-card new-test-next" aria-labelledby="new-test-next">
            <div className="class-card-head">
              <h2 id="new-test-next">După ce creezi testul</h2>
            </div>
            <ul>
              <li>
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
                  <path d="M8.5 11.5a3 3 0 0 0 4.24 0l2.5-2.5a3 3 0 0 0-4.24-4.24L10 5.76" />
                  <path d="M11.5 8.5a3 3 0 0 0-4.24 0l-2.5 2.5a3 3 0 0 0 4.24 4.24l1-1" />
                </svg>
                <div>
                  <b>Linkul elevilor e gata imediat</b>
                  <span>Testul primește linkul și codul QR din prima clipă, ca ciornă.</span>
                </div>
              </li>
              <li>
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
                  <path d="M5.5 7.5V3h9v4.5" />
                  <rect x="2.75" y="7.5" width="14.5" height="6.5" rx="1.5" />
                  <path d="M5.5 12h9v5h-9z" />
                </svg>
                <div>
                  <b>Tipărești testul cu cod QR</b>
                  <span>Din ciornă, cu zile înainte. Fiecare pagină are codul.</span>
                </div>
              </li>
              <li>
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
                  <circle cx="7.5" cy="7" r="2.75" />
                  <path d="M2.75 16c.6-2.6 2.5-4 4.75-4s4.15 1.4 4.75 4" />
                  <path d="M13 4.6a2.6 2.6 0 0 1 0 5M14.5 12.2c1.4.5 2.4 1.8 2.75 3.8" />
                </svg>
                <div>
                  <b>În ziua testului: Începe testul</b>
                  <span>Elevii scanează codul și trimit pozele. Fără cont și fără aplicație.</span>
                </div>
              </li>
            </ul>
          </section>
        </div>
      )}
      {newClass && <NewClassDialog onClose={() => setNewClass(false)} onCreated={(id) => setClassId(String(id))} />}
    </section>
  );
}
