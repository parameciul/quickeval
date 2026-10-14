import { useCallback, useEffect, useState } from 'react';
import type { LinkInfo, LinkStudent } from '../../shared/api.ts';
import { displayClassName } from '../../shared/classes.ts';
import { ApiError, GENERIC_MESSAGE, messageOf } from '../ui/ApiError.ts';
import { BrandMark } from '../ui/BrandMark.tsx';
import { ErrorBoundary } from '../ui/ErrorBoundary.tsx';
import type { ActiveSession, UploadApi } from './api.ts';
import { NamePicker } from './NamePicker.tsx';
import {
  loadResultLinks,
  pruneStaleResultLinks,
  resultPageUrl,
  saveResultLink,
  singleUploadLocked,
  type SavedResultLink,
} from './resultLinks.ts';
import { forgetSecret, loadSecret, saveSecret, savedStudent } from './session.ts';
import { UploadScreen } from './UploadScreen.tsx';

export const UNKNOWN_LINK = 'Link greșit. Cere profesorului linkul nou.';

type Phase =
  | { kind: 'loading' }
  | { kind: 'failed'; message: string }
  | { kind: 'closed'; info: LinkInfo }
  | { kind: 'names'; info: LinkInfo; message: string | null }
  | { kind: 'upload'; info: LinkInfo; session: ActiveSession }
  | { kind: 'sent'; info: LinkInfo; fileCount: number; resultToken: string; studentName: string }
  | { kind: 'locked'; info: LinkInfo };

// The student app at /u/<token>: pick your name, add the pages, send them.
// The default link sends one upload from this phone and then locks: opening
// the same link again shows only the kept result link, so a student cannot
// send for a classmate by mistake or on purpose. The link for many uploads
// (made by the teacher on demand) keeps the name list after each sent upload,
// so one phone can send for several students in turn.
export function UploadApp({ api, token }: { api: UploadApi; token: string | null }) {
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });

  // Starts or resumes the upload of one student on this phone. `auto` is true
  // when the app resumes by itself on load, not after the student picked a name.
  const begin = useCallback(
    async (linkToken: string, info: LinkInfo, student: LinkStudent, auto = false) => {
      // The default link locks after one sent upload on this phone.
      if (!info.multi) {
        pruneStaleResultLinks(linkToken, info.students);
        if (singleUploadLocked(linkToken)) {
          setPhase({ kind: 'locked', info });
          return;
        }
      }
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
        if (auto && err instanceof ApiError && err.code === 'other_device') {
          // The secret is left from an upload the teacher reset and the student
          // started on another phone: this phone forgets it and shows the names.
          forgetSecret(linkToken, student.id);
          setPhase({ kind: 'names', info, message: null });
          return;
        }
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
        pruneStaleResultLinks(token, info.students);
        // The default link shows only the kept result link after one upload.
        if (!info.multi && singleUploadLocked(token)) {
          setPhase({ kind: 'locked', info });
          return;
        }
        const saved = message === null ? savedStudent(token, info.students) : null;
        if (saved) await begin(token, info, saved, true);
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
          {phase.kind === 'closed' && token && (
            <>
              <p className="alert" role="alert">
                Încărcarea s-a închis.
              </p>
              <KeptResultLinks uploadToken={token} />
              <p className="hint">Dacă nu ai trimis lucrarea, spune-i profesorului.</p>
            </>
          )}
          {phase.kind === 'names' && token && (
            <>
              <KeptResultLinks uploadToken={token} />
              <NamePicker
                students={phase.info.students}
                message={phase.message}
                onPick={(student) => begin(token, phase.info, student)}
              />
            </>
          )}
          {phase.kind === 'locked' && token && (
            <>
              <KeptResultLinks uploadToken={token} />
              <p className="hint">
                Ai trimis deja lucrarea de pe acest telefon. Cu acest link nu mai poți încărca alte lucrări, nici pentru alt elev.
              </p>
              <p className="hint">Dacă trebuie să trimiți pentru alt elev, cere profesorului linkul pentru mai multe încărcări.</p>
            </>
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
                onSent={(fileCount, resultToken) => {
                  saveResultLink(token, phase.session.studentId, resultToken, phase.session.studentName);
                  setPhase({ kind: 'sent', info: phase.info, fileCount, resultToken, studentName: phase.session.studentName });
                }}
                onLost={(message) => load(message)}
              />
            </>
          )}
          {phase.kind === 'sent' && token && (
            <section className="sent">
              <h2>Gata! Lucrarea ta a fost trimisă.</h2>
              <p>{phase.fileCount === 1 ? 'Ai trimis un fișier.' : `Ai trimis ${phase.fileCount} fișiere.`}</p>
              <ResultLinkBox resultToken={phase.resultToken} studentName={phase.studentName} fresh />
              {phase.info.multi && (
                <>
                  <p className="hint">Poți trimite acum lucrarea altui elev, cu același link.</p>
                  <button type="button" className="button button-big" onClick={() => load(null)}>
                    Trimite pentru alt elev
                  </button>
                </>
              )}
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

// The result links this phone kept for one upload link (the same QR code).
// Shown on the upload page, so a student who did not keep the link gets it
// back on the same phone.
function KeptResultLinks({ uploadToken }: { uploadToken: string }) {
  const [links] = useState<SavedResultLink[]>(() => loadResultLinks(uploadToken));
  if (links.length === 0) return null;
  return (
    <section aria-label="Linkurile tale cu rezultate">
      {links.map((link) => (
        <ResultLinkBox key={link.studentId} resultToken={link.resultToken} studentName={link.studentName} />
      ))}
    </section>
  );
}

// One kept result link, with a copy button. After sending it also says the
// result comes only after the teacher opens the results.
export function ResultLinkBox({ resultToken, studentName, fresh = false }: { resultToken: string; studentName: string; fresh?: boolean }) {
  const [copied, setCopied] = useState(false);
  const url = resultPageUrl(resultToken);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  return (
    <div className="result-link-box">
      <p>
        {fresh ? (
          <>
            Păstrează linkul cu rezultatul{studentName ? ` pentru ${studentName}` : ''}:
          </>
        ) : (
          <>
            Linkul cu rezultatul{studentName ? ` pentru ${studentName}` : ''}:
          </>
        )}
      </p>
      <p>
        <a href={url}>Vezi rezultatul</a>
      </p>
      <div className="form-row">
        <input type="text" readOnly value={url} aria-label={`Linkul cu rezultatul${studentName ? ` pentru ${studentName}` : ''}`} />
        <button type="button" className="button-quiet button-small" onClick={copy}>
          {copied ? 'Copiat!' : 'Copiază linkul'}
        </button>
      </div>
      {fresh && <p className="hint">Rezultatul apare aici după ce profesorul publică rezultatele.</p>}
    </div>
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
