import { useCallback, useEffect, useState } from 'react';
import type { LinkInfo, LinkStudent } from '../../shared/api.ts';
import { displayClassName } from '../../shared/classes.ts';
import { ApiError, GENERIC_MESSAGE, messageOf } from '../ui/ApiError.ts';
import { BrandMark } from '../ui/BrandMark.tsx';
import { ErrorBoundary } from '../ui/ErrorBoundary.tsx';
import type { ActiveSession, UploadApi } from './api.ts';
import { NamePicker } from './NamePicker.tsx';
import { loadSecret, saveSecret, savedStudent } from './session.ts';
import { UploadScreen } from './UploadScreen.tsx';

export const UNKNOWN_LINK = 'Link greșit. Cere profesorului linkul nou.';

type Phase =
  | { kind: 'loading' }
  | { kind: 'failed'; message: string }
  | { kind: 'closed'; info: LinkInfo }
  | { kind: 'names'; info: LinkInfo; message: string | null }
  | { kind: 'upload'; info: LinkInfo; session: ActiveSession }
  | { kind: 'sent'; info: LinkInfo; fileCount: number };

// The student app at /u/<token>: pick your name, add the pages, send them.
// `token` is null when the address holds no valid upload token.
export function UploadApp({ api, token }: { api: UploadApi; token: string | null }) {
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });

  // Starts or resumes the upload of one student on this phone.
  const begin = useCallback(
    async (linkToken: string, info: LinkInfo, student: LinkStudent) => {
      const saved = loadSecret(linkToken, student.id);
      try {
        const started = await api.startSession(linkToken, student.id, saved);
        const secret = started.secret ?? saved;
        if (!secret) throw new ApiError(0, 'no_secret', GENERIC_MESSAGE);
        if (started.secret) saveSecret(linkToken, student.id, started.secret);
        setPhase({
          kind: 'upload',
          info,
          session: { studentId: student.id, studentName: started.session.studentName, secret, files: started.session.files },
        });
      } catch (err) {
        setPhase({ kind: 'names', info, message: messageOf(err) });
      }
    },
    [api],
  );

  // Loads the link page; `message` is shown above the names.
  const load = useCallback(
    async (message: string | null, isCurrent: () => boolean = () => true) => {
      if (!token) {
        setPhase({ kind: 'failed', message: UNKNOWN_LINK });
        return;
      }
      try {
        const info = await api.getLink(token);
        if (!isCurrent()) return;
        if (info.test.status !== 'open') {
          setPhase({ kind: 'closed', info });
          return;
        }
        const saved = message === null ? savedStudent(token, info.students) : null;
        if (saved) await begin(token, info, saved);
        else setPhase({ kind: 'names', info, message });
      } catch (err) {
        if (isCurrent()) setPhase({ kind: 'failed', message: messageOf(err) });
      }
    },
    [api, token, begin],
  );

  useEffect(() => {
    let current = true;
    void load(null, () => current);
    return () => {
      current = false;
    };
  }, [load]);

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
          {phase.kind !== 'loading' && phase.kind !== 'failed' && <TestTitle info={phase.info} />}
          {phase.kind === 'closed' && (
            <>
              <p className="alert" role="alert">
                Încărcarea s-a închis.
              </p>
              <p className="hint">Dacă nu ai trimis lucrarea, spune-i profesorului.</p>
            </>
          )}
          {phase.kind === 'names' && token && (
            <NamePicker
              students={phase.info.students}
              message={phase.message}
              onPick={(student) => begin(token, phase.info, student)}
            />
          )}
          {phase.kind === 'upload' && token && (
            <>
              {/* On a shared phone the app may reopen a classmate's upload: this
                  goes back to the names and keeps that upload's secret. */}
              <p className="hint">
                Nu ești {phase.session.studentName}?{' '}
                <button
                  type="button"
                  className="button-quiet button-small"
                  onClick={() => setPhase({ kind: 'names', info: phase.info, message: null })}
                >
                  Alege alt nume
                </button>
              </p>
              <UploadScreen
                api={api}
                token={token}
                session={phase.session}
                onSent={(fileCount) => setPhase({ kind: 'sent', info: phase.info, fileCount })}
                onLost={(message) => load(message)}
              />
            </>
          )}
          {phase.kind === 'sent' && (
            <section className="sent">
              <h2>Gata! Lucrarea ta a fost trimisă.</h2>
              <p>{phase.fileCount === 1 ? 'Ai trimis un fișier.' : `Ai trimis ${phase.fileCount} fișiere.`}</p>
            </section>
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

function TestTitle({ info }: { info: LinkInfo }) {
  return (
    <>
      <h1>{info.test.title}</h1>
      <p className="hint">
        {displayClassName(info.test.className)} · {info.test.code}
      </p>
    </>
  );
}
