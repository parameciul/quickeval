import { useEffect, useState } from 'react';
import { displayClassName } from '../../shared/classes.ts';
import { ApiError, messageOf } from '../ui/ApiError.ts';
import { ErrorBoundary } from '../ui/ErrorBoundary.tsx';
import { resultFileUrl, type UploadApi } from './api.ts';
import { forgetResultLinkByToken } from './resultLinks.ts';
import { ResultActions } from './ResultActions.tsx';
import { StudentResult } from './StudentResult.tsx';
import type { StudentResultView } from '../../shared/api.ts';
import { SITE_URL, StudentHeader } from './StudentHeader.tsx';

export const UNKNOWN_RESULT_LINK = 'Link greșit. Cere profesorului linkul nou.';

// The student's result page at /u/rezultat/<resultToken>: the grade, the
// mistakes, and the final words. Read-only.
export function ResultApp({ api, resultToken }: { api: UploadApi; resultToken: string | null }) {
  const [phase, setPhase] = useState<{ kind: 'loading' } | { kind: 'failed'; message: string } | { kind: 'ready'; result: StudentResultView }>({
    kind: 'loading',
  });

  useEffect(() => {
    let current = true;
    if (!resultToken) {
      setPhase({ kind: 'failed', message: UNKNOWN_RESULT_LINK });
      return;
    }
    api
      .getResult(resultToken)
      .then((result) => {
        if (current) setPhase({ kind: 'ready', result });
      })
      .catch((err) => {
        if (err instanceof ApiError && err.code === 'unknown_link') forgetResultLinkByToken(resultToken);
        if (current) setPhase({ kind: 'failed', message: messageOf(err) });
      });
    return () => {
      current = false;
    };
  }, [api, resultToken]);

  return (
    <>
      <StudentHeader />
      <main className="wrap upload-page result-page">
        <ErrorBoundary>
          {phase.kind === 'loading' && <p>Se încarcă…</p>}
          {phase.kind === 'failed' && (
            <p className="alert" role="alert">
              {phase.message}
            </p>
          )}
          {phase.kind === 'ready' && (
            <>
              <p className="hint">
                {displayClassName(phase.result.className)} · {phase.result.testCode}
              </p>
              <ResultActions result={phase.result} url={window.location.href} />
              <StudentResult result={phase.result} fileUrl={(fileId) => resultFileUrl(resultToken!, fileId)} />
            </>
          )}
        </ErrorBoundary>
      </main>
      <footer className="result-foot">
        <div className="wrap result-foot-bar">
          <a href={SITE_URL}>mqgrader.ro</a>
        </div>
      </footer>
    </>
  );
}
