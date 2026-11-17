import { useCallback, useEffect, useState } from 'react';
import type { LinkInfo, LinkStudent } from '../../shared/api.ts';
import { displayClassName } from '../../shared/classes.ts';
import { ApiError, GENERIC_MESSAGE, messageOf } from '../ui/ApiError.ts';
import { ErrorBoundary } from '../ui/ErrorBoundary.tsx';
import type { ActiveSession, UploadApi } from './api.ts';
import { NamePicker } from './NamePicker.tsx';
import {
  loadResultLinks,
  loadTestResultLinks,
  pruneStaleResultLinks,
  rememberTestKey,
  saveResultLink,
  singleUploadLocked,
  tokensToAsk,
  UNKNOWN_TEST_KEY,
  type SavedResultLink,
} from './resultLinks.ts';
import { forgetSecret, loadSecret, saveSecret, savedStudent } from './session.ts';
import { UploadScreen } from './UploadScreen.tsx';
import { ResultTicket } from './ResultTicket.tsx';
import { StudentHeader } from './StudentHeader.tsx';
import { ActionIcon } from '../ui/ActionIcon.tsx';

export const UNKNOWN_LINK = 'Link greșit. Cere profesorului linkul nou.';

type Phase =
  | { kind: 'loading' }
  | { kind: 'failed'; message: string }
  | { kind: 'notStarted'; info: LinkInfo }
  | { kind: 'closed'; info: LinkInfo }
  | { kind: 'names'; info: LinkInfo; message: string | null }
  | { kind: 'upload'; info: LinkInfo; session: ActiveSession }
  | { kind: 'sent'; info: LinkInfo; fileCount: number; resultToken: string; resultCode: string | null; studentName: string }
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
        // The teacher stopped the test while the names were on screen.
        if (err instanceof ApiError && err.code === 'not_started') {
          setPhase({ kind: 'notStarted', info });
          return;
        }
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

  // "Alege alt nume": gives the name back when the upload is still empty, then
  // shows the names. A failed call changes nothing: the name stays locked and
  // the teacher can unlock it.
  const leaveName = useCallback(
    async (linkToken: string, info: LinkInfo, session: ActiveSession) => {
      let freed = false;
      try {
        freed = await api.releaseSession(linkToken, session.secret);
      } catch {
        // Network trouble: go on to the names as before.
      }
      let current = info;
      if (freed) {
        forgetSecret(linkToken, session.studentId);
        try {
          current = await api.getLink(linkToken);
        } catch {
          // Keep the names already on screen.
        }
      }
      setPhase({ kind: 'names', info: current, message: null });
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
        rememberTestKey(token, info.test.key);
        // The QR code is on the printed test before the teacher starts it.
        if (info.test.status === 'draft') {
          setPhase({ kind: 'notStarted', info });
          return;
        }
        if (info.test.status !== 'open') {
          // The paper may have gone through the test's other link: learn
          // which test the other kept links belong to, before they are read.
          await learnOtherLinks(api, token);
          if (!isCurrent()) return;
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
      <StudentHeader />
      <main className="wrap upload-page">
        <ErrorBoundary>
          {phase.kind === 'loading' && <p>Se încarcă…</p>}
          {phase.kind === 'failed' && (
            <p className="alert" role="alert">
              {phase.message}
            </p>
          )}
          {phase.kind !== 'loading' && phase.kind !== 'failed' && <TestTitle info={phase.info} />}
          {phase.kind === 'notStarted' && (
            <>
              <p className="alert" role="alert">
                Testul nu a început încă.
              </p>
              <p className="hint">Poți încărca lucrarea după ce îl începe profesorul.</p>
              <button type="button" className="button button-big" onClick={() => load(null)}>
                <ActionIcon name="retry" />
                Verifică din nou
              </button>
            </>
          )}
          {phase.kind === 'closed' && token && <ClosedScreen uploadToken={token} info={phase.info} />}
          {phase.kind === 'names' && token && (
            <>
              <KeptResultLinks uploadToken={token} info={phase.info} />
              <NamePicker
                students={phase.info.students}
                message={phase.message}
                onPick={(student) => begin(token, phase.info, student)}
              />
            </>
          )}
          {phase.kind === 'locked' && token && (
            <>
              <KeptResultLinks uploadToken={token} info={phase.info} />
              <p className="hint">
                Ai trimis deja lucrarea de pe acest telefon. Cu acest link nu mai poți încărca alte lucrări, nici pentru alt elev.
              </p>
              <p className="hint">Dacă trebuie să trimiți pentru alt elev, cere profesorului linkul pentru mai multe încărcări.</p>
            </>
          )}
          {phase.kind === 'upload' && token && (
            <>
              {/* On a shared phone the app may reopen a classmate's upload: this
                  goes back to the names. An upload with no file is given up, so
                  its name is free for the right student; one with files keeps
                  its secret and stays locked. */}
              <p className="hint">
                Nu ești {phase.session.studentName}?{' '}
                <button
                  type="button"
                  className="button-quiet button-small"
                  onClick={() => void leaveName(token, phase.info, phase.session)}
                >
                  <ActionIcon name="edit" />
                  Alege alt nume
                </button>
              </p>
              <UploadScreen
                api={api}
                token={token}
                session={phase.session}
                onSent={(fileCount, resultToken, resultCode) => {
                  saveResultLink(token, phase.session.studentId, resultToken, phase.session.studentName, resultCode);
                  setPhase({ kind: 'sent', info: phase.info, fileCount, resultToken, resultCode, studentName: phase.session.studentName });
                }}
                onLost={(message) => load(message)}
              />
            </>
          )}
          {phase.kind === 'sent' && token && (
            <>
              <section className="sent">
                <h2>Gata! Lucrarea ta a fost trimisă.</h2>
                <p>{phase.fileCount === 1 ? 'Ai trimis un fișier.' : `Ai trimis ${phase.fileCount} fișiere.`}</p>
              </section>
              <ResultTicket
                resultToken={phase.resultToken}
                resultCode={phase.resultCode}
                studentName={phase.studentName}
                test={phase.info.test}
                fresh
              />
              {phase.info.multi && (
                <>
                  <p className="hint">Poți trimite acum lucrarea altui elev, cu același link.</p>
                  <button type="button" className="button-quiet button-big" onClick={() => load(null)}>
                    <ActionIcon name="add-person" />
                    Trimite pentru alt elev
                  </button>
                </>
              )}
            </>
          )}
        </ErrorBoundary>
      </main>
    </>
  );
}

// Asks the server which test each other link with a kept result link names,
// and remembers the answers. A link the server does not know is remembered as
// such; one that could not be asked now is asked again on the next visit.
async function learnOtherLinks(api: UploadApi, uploadToken: string): Promise<void> {
  await Promise.all(
    tokensToAsk(uploadToken).map(async (other) => {
      try {
        rememberTestKey(other, (await api.getLink(other)).test.key);
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) rememberTestKey(other, UNKNOWN_TEST_KEY);
      }
    }),
  );
}

// The page once the uploads closed. The teacher sends this link again when
// the results are published: the page then gives the result link this phone
// kept (through either link of the test), or says where the result is. A
// result opens only by its own link, so the page cannot hand it out by name.
function ClosedScreen({ uploadToken, info }: { uploadToken: string; info: LinkInfo }) {
  const [links] = useState<SavedResultLink[]>(() => loadTestResultLinks(uploadToken, info.test.key));
  const kept = links.length > 0 && <Tickets links={links} info={info} />;
  if (!info.test.resultsOpen) {
    return (
      <>
        <p className="alert" role="alert">
          Încărcarea s-a închis.
        </p>
        {kept}
        <p className="hint">Dacă nu ai trimis lucrarea, spune-i profesorului.</p>
      </>
    );
  }
  return (
    <>
      <p className="notice-ok">Rezultatele au fost publicate.</p>
      {kept || (
        <p className="hint">
          Linkul cu rezultatul tău este salvat pe telefonul și în browserul cu care ai trimis lucrarea. Dacă nu îl găsești acolo, cere profesorului linkul tău.
        </p>
      )}
    </>
  );
}

// The result links this phone kept for one upload link (the same QR code).
// Shown on the upload page, so a student who did not keep the link gets it
// back on the same phone.
function KeptResultLinks({ uploadToken, info }: { uploadToken: string; info: LinkInfo }) {
  const [links] = useState<SavedResultLink[]>(() => loadResultLinks(uploadToken));
  if (links.length === 0) return null;
  return <Tickets links={links} info={info} />;
}

// The kept result links of one test, each as its ticket.
function Tickets({ links, info }: { links: SavedResultLink[]; info: LinkInfo }) {
  return (
    <div className="tickets">
      {links.map((link) => (
        <ResultTicket
          key={link.resultToken}
          resultToken={link.resultToken}
          resultCode={link.resultCode}
          studentName={link.studentName}
          test={info.test}
        />
      ))}
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
