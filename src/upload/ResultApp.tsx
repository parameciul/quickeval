import { useEffect, useState } from 'react';
import { displayClassName } from '../../shared/classes.ts';
import { messageOf } from '../ui/ApiError.ts';
import { BrandMark } from '../ui/BrandMark.tsx';
import { ErrorBoundary } from '../ui/ErrorBoundary.tsx';
import type { UploadApi } from './api.ts';
import { StudentResult } from './StudentResult.tsx';
import type { StudentResultView } from '../../shared/api.ts';

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
        if (current) setPhase({ kind: 'failed', message: messageOf(err) });
      });
    return () => {
      current = false;
    };
  }, [api, resultToken]);

  return (
    <>
      <header className="site-header">
        <div className="wrap header-bar">
          <span className="brand">
            <BrandMark />
            <span className="brand-text">
              <span className="brand-name">QuickEval</span>
              <span className="brand-sub">Matematică cu Laura Miron</span>
            </span>
          </span>
        </div>
      </header>
      <main className="wrap upload-page">
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
              <StudentResult result={phase.result} resultToken={resultToken!} />
            </>
          )}
        </ErrorBoundary>
      </main>
      <footer className="site-footer">
        <div className="wrap">
          <p>QuickEval · Matematică cu Laura Miron</p>
        </div>
      </footer>
    </>
  );
}
