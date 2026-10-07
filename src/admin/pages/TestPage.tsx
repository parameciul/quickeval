import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import type { TestInfo } from '../../../shared/api.ts';
import { displayClassName } from '../../../shared/classes.ts';
import { MAX_TITLE_LENGTH, normalizeTestCode, type TestStatus } from '../../../shared/tests.ts';
import { formatDateTime } from '../../ui/format.ts';
import { useApi } from '../ApiContext.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';
import { StatusChip } from '../StatusChip.tsx';
import { TestFiles } from '../testPage/TestFiles.tsx';
import { UploadLink } from '../testPage/UploadLink.tsx';
import { UploadsTable } from '../testPage/UploadsTable.tsx';
import { NotFoundPage } from './NotFoundPage.tsx';

// While students upload (and later while the robot grades), the page asks for
// news every 10 seconds.
export function refreshInterval(status: TestStatus | undefined): number | false {
  return status === 'open' || status === 'evaluating' ? 10_000 : false;
}

export function TestPage() {
  const code = normalizeTestCode(useParams().code ?? '');
  if (code === null) return <NotFoundPage />;
  return <TestDetails key={code} code={code} />;
}

function TestDetails({ code }: { code: string }) {
  const api = useApi();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const notice = (useLocation().state as { notice?: string } | null)?.notice;
  const detail = useQuery({
    queryKey: ['test', code],
    queryFn: () => api.getTest(code),
    refetchInterval: (query) => refreshInterval(query.state.data?.test.status),
  });
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['test', code] });
    await queryClient.invalidateQueries({ queryKey: ['tests'] });
  };
  const remove = useMutation({
    mutationFn: () => api.deleteTest(code),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['tests'] });
      navigate('/');
    },
  });

  if (detail.isPending) return <p>Se încarcă…</p>;
  if (detail.error) return <ErrorMessage error={detail.error} />;

  const { test, uploads } = detail.data;
  return (
    <section>
      <p>
        <Link to="/">← Toate testele</Link>
      </p>
      {notice && (
        <p className="alert" role="alert">
          {notice}
        </p>
      )}
      <div className="page-head">
        <h1>{test.code}</h1>
        <StatusChip status={test.status} />
      </div>
      <p className="lead-line">
        {test.title} · <Link to={`/clase/${test.classId}`}>{displayClassName(test.className)}</Link>
        {test.startedAt && ` · început ${formatDateTime(test.startedAt)}`}
      </p>
      <RenameTestForm code={code} currentTitle={test.title} onDone={refresh} />

      <TestFiles test={test} onChanged={refresh} />

      <h2>Încărcarea lucrărilor</h2>
      <TestActions test={test} onChanged={refresh} />

      <h2>
        Încărcări · trimise {test.submittedCount} din {test.studentCount}
      </h2>
      <UploadsTable code={code} uploads={uploads} onChanged={refresh} />

      <h2>Șterge testul</h2>
      <p className="hint">Se șterg și toate lucrările încărcate de elevi.</p>
      <button
        type="button"
        className="button-quiet button-danger"
        disabled={remove.isPending}
        onClick={() => {
          if (window.confirm(`Ștergi testul ${code}? Se șterg și toate lucrările încărcate.`)) remove.mutate();
        }}
      >
        Șterge testul
      </button>
      {remove.error && <ErrorMessage error={remove.error} />}
    </section>
  );
}

// What the teacher can do next, by the state of the test.
function TestActions({ test, onChanged }: { test: TestInfo; onChanged: () => Promise<void> }) {
  const api = useApi();
  const start = useMutation({ mutationFn: () => api.startTest(test.code), onSuccess: onChanged });
  const reopen = useMutation({ mutationFn: () => api.reopenTest(test.code), onSuccess: onChanged });

  if (test.status === 'draft') {
    return (
      <>
        <p className="hint">Elevii pot încărca lucrările după ce începi testul. Atunci apar linkul și codul QR.</p>
        <button type="button" className="button" disabled={start.isPending} onClick={() => start.mutate()}>
          Începe testul
        </button>
        {start.error && <ErrorMessage error={start.error} />}
      </>
    );
  }
  if (test.status === 'open' && test.uploadToken) return <UploadLink token={test.uploadToken} />;
  return (
    <>
      <p className="hint">Încărcarea este închisă. Dacă o redeschizi, elevii care nu au trimis pot încărca acum.</p>
      <button type="button" className="button-quiet" disabled={reopen.isPending} onClick={() => reopen.mutate()}>
        Redeschide încărcarea
      </button>
      {reopen.error && <ErrorMessage error={reopen.error} />}
    </>
  );
}

function RenameTestForm({ code, currentTitle, onDone }: { code: string; currentTitle: string; onDone: () => Promise<void> }) {
  const api = useApi();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(currentTitle);
  const rename = useMutation({
    mutationFn: () => api.renameTest(code, title),
    onSuccess: async () => {
      setOpen(false);
      await onDone();
    },
  });

  if (!open) {
    return (
      <button
        type="button"
        className="button-quiet button-small"
        onClick={() => {
          setTitle(currentTitle);
          setOpen(true);
        }}
      >
        Redenumește testul
      </button>
    );
  }
  return (
    <form
      className="form-row"
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        rename.mutate();
      }}
    >
      <label htmlFor="rename-test">Titlu nou</label>
      <input id="rename-test" type="text" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={MAX_TITLE_LENGTH} required />
      <button className="button button-small" type="submit" disabled={rename.isPending}>
        Salvează
      </button>
      <button type="button" className="button-quiet button-small" onClick={() => setOpen(false)}>
        Renunță
      </button>
      {rename.error && <ErrorMessage error={rename.error} />}
    </form>
  );
}
