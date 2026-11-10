import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type ChangeEvent } from 'react';
import type { TestDetail } from '../../shared/api.ts';
import { fileProblem, MAX_STUDENT_FILES, STUDENT_FILE_TYPES, STUDENT_WRONG_TYPE, type TestFileKind } from '../../shared/files.ts';
import { testFileUrl } from '../admin/api.ts';
import { useApi } from '../admin/ApiContext.tsx';
import { ErrorMessage } from '../admin/ErrorMessage.tsx';
import { FileDrop } from '../admin/newTest/FileDrop.tsx';
import { formatFileSize } from '../ui/format.ts';
import type { TryApi } from './api.ts';
import { fileChangesLeft } from './phase.ts';

const PAGE_ACCEPT = [...STUDENT_FILE_TYPES, '.jpg', '.jpeg', '.png', '.webp', '.pdf'].join(',');

// Before the grading (spec §3.3, states 1 and 2): the test, the barem (her
// own, or the robot's, which she downloads and reads), and the student's
// pages, then "Pornește corectarea". The landing page's form sends these
// first; here she sends what is missing and may replace a file.
export function Prepare({ detail, tryApi }: { detail: TestDetail; tryApi: TryApi }) {
  const queryClient = useQueryClient();
  const { test } = detail;
  const pages = useQuery({ queryKey: ['try', 'pages'], queryFn: () => tryApi.listPages() });
  const pageCount = pages.data?.length ?? 0;
  const robotBarem = test.barem.unchecked && test.files.barem !== null;
  const baremBusy = test.barem.request === 'requested';
  const missing = [
    test.files.test === null && 'testul',
    (test.files.barem === null || baremBusy) && 'baremul',
    pageCount === 0 && 'paginile lucrării',
  ].filter((part) => part !== false);
  const start = useMutation({
    mutationFn: () => tryApi.start(robotBarem ? test.filesVersion : undefined),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['test', test.code] }),
  });
  const left = fileChangesLeft(detail);

  return (
    <>
      <ol className="steps">
        <li className="step">
          <div>
            <h2>Testul</h2>
            <p>Testul așa cum l-ai tipărit, fără răspunsuri. PDF sau Word.</p>
            <TestFile code={test.code} kind="test" name={test.files.test?.name ?? null} disabled={left === 0} />
          </div>
        </li>
        <li className="step">
          <div>
            <h2>Baremul</h2>
            <Barem detail={detail} robotBarem={robotBarem} disabled={left === 0} />
          </div>
        </li>
        <li className="step">
          <div>
            <h2>Lucrarea elevului</h2>
            <p>Pozele sau PDF-ul lucrării unui elev, în ordinea paginilor. Cel mult {MAX_STUDENT_FILES} de fișiere.</p>
            <Pages tryApi={tryApi} />
          </div>
        </li>
      </ol>
      <p className="hint">
        {left === 0
          ? 'Nu mai poți schimba testul sau baremul în această încercare.'
          : `Mai poți încărca testul și baremul de ${left} ori în total. Baremul făcut de robot se numără și el o dată.`}
      </p>
      <div className="card-actions">
        <button type="button" className="button" disabled={missing.length > 0 || start.isPending} onClick={() => start.mutate()}>
          Pornește corectarea
        </button>
      </div>
      {missing.length > 0 && <p className="hint">Lipsește: {missing.join(', ')}.</p>}
      {start.error && <ErrorMessage error={start.error} />}
    </>
  );
}

function useUpload(code: string, kind: TestFileKind) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => api.uploadTestFile(code, kind, file),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['test', code] }),
  });
}

// A file of the test: its name opens it, and a new file replaces it.
export function TestFile({ code, kind, name, disabled }: { code: string; kind: TestFileKind; name: string | null; disabled: boolean }) {
  const api = useApi();
  const upload = useUpload(code, kind);
  const label = kind === 'test' ? 'Fișierul testului' : 'Fișierul baremului';
  return (
    <>
      {name !== null && (
        <p>
          <a href={testFileUrl(code, kind, undefined, api.base)} target="_blank" rel="noopener">
            {name}
          </a>
        </p>
      )}
      <FileDrop id={`try-${kind}`} name={label} disabled={disabled || upload.isPending} onPick={(file) => file && upload.mutate(file)} />
      {upload.isPending && <p className="hint">Se trimite…</p>}
      {upload.error && <ErrorMessage error={upload.error} />}
    </>
  );
}

// The barem: the robot's while it is made, then to download and read; her
// own file; or the choice of one of the two.
function Barem({ detail, robotBarem, disabled }: { detail: TestDetail; robotBarem: boolean; disabled: boolean }) {
  const api = useApi();
  const queryClient = useQueryClient();
  const { test } = detail;
  const generate = useMutation({
    mutationFn: () => api.generateBarem(test.code),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['test', test.code] }),
  });
  if (test.barem.request === 'requested') {
    return (
      <p role="status">Robotul face baremul din test. Durează câteva minute; pagina se actualizează singură.</p>
    );
  }
  if (robotBarem) {
    return (
      <>
        <p role="status">
          <strong>Baremul făcut de robot este gata.</strong> Descarcă-l și citește-l. Corectarea pornește doar când apeși „Pornește corectarea”.
        </p>
        <p>
          <a className="button-quiet" href={testFileUrl(test.code, 'barem', undefined, api.base)} target="_blank" rel="noopener">
            Descarcă baremul
          </a>
        </p>
        <p>Dacă vrei, îl înlocuiești cu baremul tău:</p>
        <TestFile code={test.code} kind="barem" name={null} disabled={disabled} />
      </>
    );
  }
  if (test.files.barem !== null) {
    return (
      <>
        <p>Baremul tău. PDF sau Word.</p>
        <TestFile code={test.code} kind="barem" name={test.files.barem.name} disabled={disabled} />
      </>
    );
  }
  return (
    <>
      <p>Baremul după care se dă punctajul. PDF sau Word.</p>
      <TestFile code={test.code} kind="barem" name={null} disabled={disabled} />
      <p>Nu ai barem? Robotul îl face din test, iar tu îl citești înainte să pornești corectarea.</p>
      <button
        type="button"
        className="button-quiet"
        disabled={test.files.test === null || disabled || generate.isPending}
        onClick={() => generate.mutate()}
      >
        Fă baremul din test
      </button>
      {generate.error && <ErrorMessage error={generate.error} />}
    </>
  );
}

// The student's pages: each one sent as it is picked, in order, and each one
// can be taken out again before the grading.
function Pages({ tryApi }: { tryApi: TryApi }) {
  const queryClient = useQueryClient();
  const pages = useQuery({ queryKey: ['try', 'pages'], queryFn: () => tryApi.listPages() });
  const [problem, setProblem] = useState<string | null>(null);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['try', 'pages'] });
  const add = useMutation({
    mutationFn: async (files: File[]) => {
      for (const file of files) await tryApi.addPage(file);
    },
    onSettled: refresh,
  });
  const remove = useMutation({ mutationFn: (fileId: number) => tryApi.deletePage(fileId), onSettled: refresh });
  const list = pages.data ?? [];
  const onPick = (event: ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(event.target.files ?? []);
    event.target.value = '';
    const refused = picked.map((file) => fileProblem(file, STUDENT_FILE_TYPES, STUDENT_WRONG_TYPE)).find((found) => found !== null) ?? null;
    setProblem(refused);
    if (refused === null && picked.length > 0) add.mutate(picked);
  };

  return (
    <>
      {list.length > 0 && (
        <ol className="try-pages" aria-label="Paginile lucrării">
          {list.map((page, index) => (
            <li key={page.id}>
              <span>
                Pagina {index + 1}: {page.name} · {formatFileSize(page.size)}
              </span>
              <button
                type="button"
                className="button-quiet button-small"
                aria-label={`Șterge pagina ${index + 1}`}
                disabled={remove.isPending}
                onClick={() => remove.mutate(page.id)}
              >
                Șterge
              </button>
            </li>
          ))}
        </ol>
      )}
      <label className={list.length >= MAX_STUDENT_FILES || add.isPending ? 'button-quiet is-disabled' : 'button-quiet'}>
        Adaugă pagini
        <input
          type="file"
          className="sr-only"
          accept={PAGE_ACCEPT}
          multiple
          disabled={list.length >= MAX_STUDENT_FILES || add.isPending}
          onChange={onPick}
        />
      </label>
      {add.isPending && <p className="hint">Se trimit paginile…</p>}
      {problem && (
        <p className="alert" role="alert">
          {problem}
        </p>
      )}
      {pages.error && <ErrorMessage error={pages.error} />}
      {add.error && <ErrorMessage error={add.error} />}
      {remove.error && <ErrorMessage error={remove.error} />}
    </>
  );
}
