import { useCallback, useEffect, useState } from 'react';
import { studentResultPath, type LinkInfo, type LinkStudent, type ResultCodeAnswer } from '../../shared/api.ts';
import { displayClassName } from '../../shared/classes.ts';
import { ApiError, GENERIC_MESSAGE, messageOf } from '../ui/ApiError.ts';
import { ErrorBoundary } from '../ui/ErrorBoundary.tsx';
import type { ActiveSession, UploadApi } from './api.ts';
import { CodeEntry } from './CodeEntry.tsx';
import { NamePicker } from './NamePicker.tsx';
import {
  forgetResultLinkByToken,
  loadResultLink,
  loadResultLinks,
  loadTestResultLinks,
  pruneStaleResultLinks,
  rememberResultCode,
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

// What the student does with the ticket: one line, under every "sent" title.
export const SAVE_TICKET_LINE =
  'Salvează biletul de mai jos sau trimite-ți linkul. Cu ele îți vezi rezultatul după ce profesorul corectează și publică lucrarea.';

type Phase =
  | { kind: 'loading' }
  | { kind: 'failed'; message: string }
  | { kind: 'opening' }
  | { kind: 'notStarted'; info: LinkInfo }
  // `waiting`: the test has published results, but not the one of the paper
  // this phone sent.
  | { kind: 'closed'; info: LinkInfo; waiting?: boolean }
  | { kind: 'names'; info: LinkInfo; message: string | null }
  | { kind: 'upload'; info: LinkInfo; session: ActiveSession }
  | { kind: 'sent'; info: LinkInfo; fileCount: number; resultToken: string; resultCode: string | null; studentName: string }
  | { kind: 'locked'; info: LinkInfo };

// Outside the component: `load` depends on it, and a new function on every
// render would load the link again and again.
function replacePage(url: string) {
  window.location.replace(url);
}

// The student app at /u/<token>: pick your name, add the pages, send them.
// The default link sends one upload from this phone and then locks: opening
// the same link again shows only the kept result link, so a student cannot
// send for a classmate by mistake or on purpose. The link for many uploads
// (made by the teacher on demand) keeps the name list after each sent upload,
// so one phone can send for several students in turn.
export function UploadApp({
  api,
  token,
  goTo = (url) => window.location.assign(url),
  openResult = replacePage,
}: {
  api: UploadApi;
  token: string | null;
  // Opens another page; tests pass a fake.
  goTo?: (url: string) => void;
  // Opens the result in place of this page, so Back does not come back here
  // and open it again; tests pass a fake.
  openResult?: (url: string) => void;
}) {
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
        // Closed: the grading started, or the teacher closed the uploads.
        if (info.test.status !== 'open' || info.test.uploadsClosed) {
          // The paper may have gone through the test's other link: learn
          // which test the other kept links belong to, before they are read.
          await learnOtherLinks(api, token);
          if (!isCurrent()) return;
          // Published, and this phone sent one paper of this test: the student
          // came for that result, so it opens at once. With more (a shared
          // phone) the page cannot know whose it is.
          const kept = info.test.resultsOpen ? loadTestResultLinks(token, info.test.key) : [];
          if (kept.length === 1) {
            const own = await ownResult(api, kept[0]!.resultToken);
            if (!isCurrent()) return;
            if (own === 'open') {
              setPhase({ kind: 'opening' });
              openResult(studentResultPath(kept[0]!.resultToken));
              return;
            }
            setPhase({ kind: 'closed', info, waiting: own === 'closed' });
            return;
          }
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
    [api, token, begin, openResult],
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
          {phase.kind === 'opening' && <p>Se deschide rezultatul…</p>}
          {phase.kind === 'failed' && (
            <p className="alert" role="alert">
              {phase.message}
            </p>
          )}
          {phase.kind !== 'loading' && phase.kind !== 'failed' && phase.kind !== 'opening' && <TestTitle info={phase.info} />}
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
          {phase.kind === 'closed' && token && (
            <ClosedScreen api={api} uploadToken={token} info={phase.info} waiting={phase.waiting ?? false} goTo={goTo} />
          )}
          {phase.kind === 'names' && token && (
            <>
              <KeptResultLinks uploadToken={token} info={phase.info} heading />
              <NamePicker
                students={phase.info.students}
                message={phase.message}
                onPick={(student) => begin(token, phase.info, student)}
              />
            </>
          )}
          {phase.kind === 'locked' && token && <LockedScreen uploadToken={token} info={phase.info} />}
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
                <p>{SAVE_TICKET_LINE}</p>
              </section>
              <ResultTicket
                resultToken={phase.resultToken}
                resultCode={phase.resultCode}
                studentName={phase.studentName}
                test={phase.info.test}
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
// the results are published: a phone that sent one paper of the test (through
// either link) opens that result before this page shows; one that sent none
// or several asks for the code, and shows no ticket. A result opens only by
// its own link, so the page cannot hand it out by name. A student whose phone
// sent nothing (another phone, a cleared browser) types the short code of the
// ticket once the results are published, and the result opens. The phone
// keeps only the links it sent: a code typed on a classmate's phone would
// otherwise open there by itself for its owner. Before the publish there is
// no field: a code would open nothing yet. Nor while this phone's own result
// waits (other results are out): the phone sent that paper, so the page is
// for its result.
function ClosedScreen({
  api,
  uploadToken,
  info,
  waiting,
  goTo,
}: {
  api: UploadApi;
  uploadToken: string;
  info: LinkInfo;
  // The test has published results, but not the one of the paper this phone sent.
  waiting: boolean;
  goTo: (url: string) => void;
}) {
  const [links] = useState<SavedResultLink[]>(() => loadTestResultLinks(uploadToken, info.test.key));
  const opened = (answer: ResultCodeAnswer) => {
    // A link this phone sent learns its code if it was kept before links had
    // codes; a code never adds a link to the phone.
    if (loadResultLink(uploadToken, answer.studentId)?.resultToken === answer.resultToken) {
      rememberResultCode(answer.resultToken, answer.resultCode);
    }
    goTo(studentResultPath(answer.resultToken));
  };
  if (!info.test.resultsOpen || waiting) {
    // Archiving closes the results, and they may never open again: no word
    // on waiting for a publish, and no ticket, whose picture promises a
    // result; also when the teacher published a few results of the test.
    if (info.test.archived) {
      return (
        <div className="notice" role="status">
          {links.length > 0 ? (
            <p>Testul a fost arhivat și rezultatele nu mai sunt disponibile. Dacă ai nevoie de rezultat, întreabă profesorul.</p>
          ) : (
            <p>
              <strong>Testul a fost arhivat.</strong> Dacă ai nevoie de ceva, întreabă profesorul.
            </p>
          )}
        </div>
      );
    }
    // No ticket on this phone: the student most likely sent nothing from it,
    // so the page says only that, in one grey box. Grey, not red: closed
    // uploads are the normal next step, not an error.
    if (links.length === 0) {
      return (
        <div className="notice" role="status">
          <p>
            <strong>Încărcarea s-a închis.</strong>
          </p>
          <p>Dacă nu ai trimis lucrarea, spune-i profesorului.</p>
        </div>
      );
    }
    // This phone sent the work: the tickets it kept stay, so a student who
    // did not save one after sending can still save it.
    return (
      <>
        <SentNotice count={links.length} waiting={waiting} />
        <Tickets links={links} info={info} />
      </>
    );
  }
  // Published: one kept link opened before this page showed, so here the phone
  // keeps none or several (a shared phone). No tickets: the student's own code
  // opens the right result.
  return (
    <>
      <p className="notice-ok">Rezultatele au fost publicate.</p>
      <CodeEntry api={api} token={uploadToken} onOpened={opened} />
    </>
  );
}

// The green box over the tickets this phone kept: the work went, and the
// ticket is how the student sees the result. `waiting`: other results of the
// test are out, but not this one, so the student knows why it does not open.
function SentNotice({ count, waiting = false }: { count: number; waiting?: boolean }) {
  return (
    <section className="sent" role="status">
      <h2>{count === 1 ? 'Lucrarea ta a fost trimisă.' : 'Lucrările au fost trimise de pe acest telefon.'}</h2>
      {waiting && <p>Rezultatul tău nu a fost publicat încă.</p>}
      <p>{SAVE_TICKET_LINE}</p>
    </section>
  );
}

// The default link opened again on the phone that sent through it: the work
// went, so the page says so and keeps the ticket; no other upload from here.
function LockedScreen({ uploadToken, info }: { uploadToken: string; info: LinkInfo }) {
  const [links] = useState<SavedResultLink[]>(() => loadResultLinks(uploadToken));
  return (
    <>
      <SentNotice count={Math.max(links.length, 1)} />
      {links.length > 0 && <Tickets links={links} info={info} />}
      <p className="hint">
        Cu acest link nu mai poți trimite altă lucrare. Pentru alt elev, cere profesorului linkul pentru mai multe încărcări.
      </p>
    </>
  );
}

// Whether the result of a paper this phone sent can open now: 'closed' while
// the teacher keeps it unpublished (other results of the test may be out),
// 'gone' for a link the server no longer knows (a reset paper: it is
// forgotten, so the page asks for the code), else 'open'. It asks only that,
// not for the result, which the result page then reads. On any other trouble
// the result page opens and says what is wrong.
async function ownResult(api: UploadApi, resultToken: string): Promise<'open' | 'closed' | 'gone'> {
  try {
    return (await api.resultPublished(resultToken)) ? 'open' : 'closed';
  } catch (err) {
    if (err instanceof ApiError && err.code === 'unknown_link') {
      forgetResultLinkByToken(resultToken);
      return 'gone';
    }
    return 'open';
  }
}

// The result links this phone kept for one upload link (the same QR code).
// Shown on the upload page, so a student who did not keep the link gets it
// back on the same phone.
function KeptResultLinks({ uploadToken, info, heading = false }: { uploadToken: string; info: LinkInfo; heading?: boolean }) {
  const [links] = useState<SavedResultLink[]>(() => loadResultLinks(uploadToken));
  if (links.length === 0) return null;
  return (
    <>
      {heading && (
        <h2>{links.length === 1 ? 'Biletul lucrării trimise de pe acest telefon' : 'Biletele lucrărilor trimise de pe acest telefon'}</h2>
      )}
      <Tickets links={links} info={info} />
    </>
  );
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
