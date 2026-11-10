import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useLocation } from 'react-router';
import type { SubmissionDetail, TestDetail } from '../../shared/api.ts';
import { useApi } from '../admin/ApiContext.tsx';
import { ErrorMessage } from '../admin/ErrorMessage.tsx';
import { reviewPath } from '../admin/reviewPage/points.ts';
import { GradedResult } from '../admin/submissionPage/GradedResult.tsx';
import { PageFiles } from '../admin/submissionPage/PageFiles.tsx';
import { StudentResult } from '../upload/StudentResult.tsx';
import { countLabel } from '../ui/format.ts';
import { onTabKeyDown } from '../ui/tabKeys.ts';
import { pageFileUrl, type TryApi } from './api.ts';
import { paperOf } from './phase.ts';

type View = 'verificare' | 'profesor' | 'elev';
const VIEWS: { id: View; label: string }[] = [
  { id: 'verificare', label: 'Verificare' },
  { id: 'profesor', label: 'Rezultatul profesorului' },
  { id: 'elev', label: 'Rezultatul elevului' },
];
const VIEW_IDS = VIEWS.map((view) => view.id);

// The review's own links back (#verificare, #rezultate) open the view they name.
function viewOfHash(hash: string): View {
  return hash === '#rezultate' ? 'profesor' : 'verificare';
}

// The graded paper (spec §3.3, state 4), in the app's three views: the points
// to check (the app's own review), the teacher's result with its corrections,
// and the page the student would see.
export function Graded({ detail, token, tryApi }: { detail: TestDetail; token: string; tryApi: TryApi }) {
  const [view, setView] = useState<View>(viewOfHash(useLocation().hash));
  const paper = paperOf(detail)!;
  return (
    <>
      <div className="class-tabs" role="tablist" aria-label="Lucrarea corectată" onKeyDown={(event) => onTabKeyDown(event, VIEW_IDS, view, setView, (id) => `try-tab-${id}`)}>
        {VIEWS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`try-tab-${id}`}
            aria-selected={view === id}
            tabIndex={view === id ? 0 : -1}
            aria-controls={`try-panel-${id}`}
            className="class-tab"
            onClick={() => setView(id)}
          >
            {label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`try-panel-${view}`} aria-labelledby={`try-tab-${view}`}>
        {view === 'verificare' && <Checking code={detail.test.code} flagCount={paper.flagCount} />}
        {view === 'profesor' && <TeacherResult code={detail.test.code} submissionId={paper.submissionId!} />}
        {view === 'elev' && <StudentView token={token} tryApi={tryApi} />}
      </div>
    </>
  );
}

// The review opens on its first point (the app's review picks it).
function Checking({ code, flagCount }: { code: string; flagCount: number }) {
  if (flagCount === 0) {
    return <p className="review-done">Toate punctele sunt verificate. Rezultatul profesorului și cel al elevului sunt gata.</p>;
  }
  return (
    <div className="try-state">
      <p>
        Robotul nu a fost sigur de {countLabel(flagCount, 'punct', 'puncte')}. Le verifici una câte una, cu pagina lucrării alături, și schimbi punctajul
        dacă e nevoie.
      </p>
      <Link className="button" to={reviewPath(code)}>
        Verifică {countLabel(flagCount, 'punct', 'puncte')}
      </Link>
    </div>
  );
}

function TeacherResult({ code, submissionId }: { code: string; submissionId: number }) {
  const api = useApi();
  const queryClient = useQueryClient();
  const paper = useQuery({ queryKey: ['submission', submissionId], queryFn: () => api.getSubmission(submissionId) });
  const saved = async (submission: SubmissionDetail) => {
    queryClient.setQueryData(['submission', submissionId], submission);
    await queryClient.invalidateQueries({ queryKey: ['test', code] });
  };
  if (paper.isPending) return <p>Se încarcă…</p>;
  if (paper.data === undefined) return <ErrorMessage error={paper.error} />;
  const submission = paper.data;
  if (!submission.evaluation) return null;
  return (
    <div className="try-result">
      <GradedResult submissionId={submissionId} evaluation={submission.evaluation} onSaved={saved} />
      <h2>Paginile lucrării</h2>
      <PageFiles submissionId={submissionId} files={submission.files} />
    </div>
  );
}

// Read again each time it opens: a correction of the teacher shows here too.
function StudentView({ token, tryApi }: { token: string; tryApi: TryApi }) {
  const result = useQuery({ queryKey: ['try', 'result'], queryFn: () => tryApi.result(), staleTime: 0, refetchOnMount: 'always' });
  if (result.isPending) return <p>Se încarcă…</p>;
  if (result.data === undefined) return <ErrorMessage error={result.error} />;
  return (
    <div className="try-student" data-testid="student-view">
      <p className="hint">Așa vede elevul rezultatul, pe linkul lui.</p>
      <StudentResult result={result.data} fileUrl={(fileId) => pageFileUrl(token, fileId)} />
    </div>
  );
}
