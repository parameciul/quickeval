import { QRCodeSVG } from 'qrcode.react';
import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import type { TestInfo } from '../../../shared/api.ts';
import { ActionIcon, type ActionIconName } from '../../ui/ActionIcon.tsx';
import { ApiError } from '../../ui/ApiError.ts';
import { useApi } from '../ApiContext.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';
import { Modal } from '../Modal.tsx';
import { StageSection } from './StageNow.tsx';
import { QrOverlay, uploadLink } from './UploadLink.tsx';
import { t } from '../../i18n/t.ts';

export type Copied = 'yes' | 'made' | 'failed' | null;

// Copies a link. `make` gives the address, or a promise of it when the link
// is made on this first click (the teacher's link): the copy then hands the
// clipboard a promise (ClipboardItem), because Safari refuses a copy that
// comes after an await, outside the click.
export async function copyLink(make: () => string | Promise<string>): Promise<void> {
  const value = make();
  if (typeof value === 'string') {
    await navigator.clipboard.writeText(value);
    return;
  }
  let failure: unknown = null;
  const url = value.catch((err: unknown) => {
    failure = err;
    throw err;
  });
  // Never left unhandled, whichever way the copy ends.
  url.catch(() => undefined);
  try {
    if (typeof ClipboardItem !== 'undefined' && typeof navigator.clipboard.write === 'function') {
      await navigator.clipboard.write([new ClipboardItem({ 'text/plain': url.then((text) => new Blob([text], { type: 'text/plain' })) })]);
    } else {
      await navigator.clipboard.writeText(await url);
    }
  } catch (err) {
    // A clipboard that gave up before the link came: wait for the link, so a
    // refusal of the API shows as itself.
    await url.then(
      () => undefined,
      () => undefined,
    );
    throw failure ?? err;
  }
}

export function CopiedNote({ copied }: { copied: Copied }) {
  if (copied === 'yes') return <span role="status">{t('Copiat!')}</span>;
  if (copied === 'made') return <span role="status">{t('Linkul tău a fost creat și copiat.')}</span>;
  if (copied === 'failed') return <span role="status">{t('Nu am putut copia. Arată codul QR: linkul e sub el.')}</span>;
  return null;
}

// The QR code of a link in a window, with the link under it, a copy, and for
// the students' link the code on the whole screen (for the board or the
// projector). `extra` adds a button (the QR code as a file).
export function QrWindow({
  title,
  hint,
  url,
  fullScreen,
  extra,
  returnFocus,
  onClose,
}: {
  title: string;
  hint: string;
  url: string;
  fullScreen?: () => void;
  extra?: ReactNode;
  returnFocus: RefObject<HTMLElement | null>;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState<Copied>(null);
  return (
    <Modal title={title} onClose={onClose} returnFocus={returnFocus}>
      <div className="modal-body qr-window">
        <p className="hint">{hint}</p>
        <QRCodeSVG value={url} size={288} marginSize={4} title={t('Codul QR al linkului')} className="qr-window-code" />
        <p className="qr-window-url">{url}</p>
        <div className="qr-window-actions">
          <button
            type="button"
            className="button-quiet button-small"
            onClick={() => copyLink(() => url).then(() => setCopied('yes'), () => setCopied('failed'))}
          >
            <ActionIcon name="copy" />
            {t('Copiază linkul')}
          </button>
          {fullScreen && (
            <button type="button" className="button-quiet button-small" onClick={fullScreen}>
              <ActionIcon name="expand" />
              {t('Pe tot ecranul')}
            </button>
          )}
          {extra}
          <CopiedNote copied={copied} />
        </div>
      </div>
    </Modal>
  );
}

function Way({ icon, title, text, children }: { icon: ActionIconName; title: ReactNode; text: string; children?: ReactNode }) {
  return (
    <li>
      <span className="ways-icon" aria-hidden="true">
        <ActionIcon name={icon} />
      </span>
      <p className="ways-text">
        <strong>{title}</strong>
        <span>{text}</span>
      </p>
      {children && <div className="ways-buttons">{children}</div>}
    </li>
  );
}

// How the students send their work (design A): the QR code on the printed
// test, the test's link from the teacher, and, while the test is open, the
// teacher's own link for many papers from one phone. No address shows on the
// page: each link has a copy and a QR code in a window. The teacher's link is
// made on its first copy or QR code (the server keeps the one it made).
export function WaysIn({ test, onChanged }: { test: TestInfo; onChanged: () => Promise<void> }) {
  const api = useApi();
  const [shown, setShown] = useState<'students' | 'teacher' | null>(null);
  const [fullScreen, setFullScreen] = useState(false);
  const [studentsCopied, setStudentsCopied] = useState<Copied>(null);
  const [teacherCopied, setTeacherCopied] = useState<Copied>(null);
  const [teacherUrl, setTeacherUrl] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const studentsQr = useRef<HTMLButtonElement>(null);
  // The teacher's link while it is being made: a second click (or the other
  // button) waits for the same request instead of making it twice.
  const making = useRef<Promise<string> | null>(null);
  const teacherQr = useRef<HTMLButtonElement>(null);
  // The uploads closed (or the grading started) while the QR code was on the
  // whole screen: the ways go, so the focus goes to the panel's heading.
  const overlayOpen = useRef(false);
  overlayOpen.current = fullScreen;
  useEffect(
    () => () => {
      if (overlayOpen.current) document.querySelector<HTMLElement>('.stage-head h2')?.focus();
    },
    [],
  );
  const token = test.uploadToken;
  if (token === null) return null;
  const url = uploadLink(token);
  const draft = test.status === 'draft';

  // The teacher's link: the kept one, else made now. The address is ready as
  // soon as the API answers; the page reads the test again meanwhile.
  const teacherLink = (): string | Promise<string> => {
    if (test.multiUploadToken) return uploadLink(test.multiUploadToken);
    if (making.current) return making.current;
    const made = api.createMultiUploadLink(test.code).then((token) => {
      onChanged().catch(() => undefined);
      return uploadLink(token);
    });
    making.current = made;
    made.catch(() => {
      if (making.current === made) making.current = null;
    });
    return made;
  };
  const copyTeacher = async () => {
    setError(null);
    const made = test.multiUploadToken === null;
    try {
      await copyLink(teacherLink);
      setTeacherCopied(made ? 'made' : 'yes');
    } catch (err) {
      if (err instanceof ApiError) setError(err);
      else setTeacherCopied('failed');
    }
  };
  const showTeacherQr = async () => {
    setError(null);
    try {
      setTeacherUrl(await teacherLink());
      setShown('teacher');
    } catch (err) {
      setError(err);
    }
  };

  return (
    <StageSection title={draft ? t('Cum vor trimite elevii lucrarea') : t('Cum trimit elevii lucrarea')}>
      <ul className="ways">
        <Way icon="print" title={t('Scanează codul QR de pe foaia testului')} text={t('Codul e pe fiecare pagină tipărită. E calea obișnuită.')} />
        <Way
          icon="link"
          title={t('Sau deschid linkul testului, primit de la tine')}
          text={
            draft
              ? t('Pentru un elev fără foaie. Linkul merge după ce începi testul.')
              : t('Pentru un elev fără foaie: trimite-i linkul sau arată codul pe tablă sau pe proiector.')
          }
        >
          <button
            type="button"
            className="button-quiet button-small"
            onClick={() => copyLink(() => url).then(() => setStudentsCopied('yes'), () => setStudentsCopied('failed'))}
          >
            <ActionIcon name="copy" />
            {t('Copiază linkul')}
          </button>
          <button ref={studentsQr} type="button" className="button-quiet button-small" onClick={() => setShown('students')}>
            <ActionIcon name="qr" />
            {t('Arată codul QR')}
          </button>
          <CopiedNote copied={studentsCopied} />
        </Way>
        {test.status === 'open' && (
          <Way
            icon="phone"
            title={
              <>
                {t('Tu încarci lucrările mai multor elevi')}{' '}<span className="ways-tag">{t('doar pentru tine')}</span>
              </>
            }
            text={t('De pe telefonul tău, pe rând, pentru elevii fără telefon. Nu da acest link elevilor.')}
          >
            <button type="button" className="button-quiet button-small" onClick={() => void copyTeacher()}>
              <ActionIcon name="copy" />
              {t('Copiază linkul tău')}
            </button>
            <button ref={teacherQr} type="button" className="button-quiet button-small" onClick={() => void showTeacherQr()}>
              <ActionIcon name="qr" />
              {t('Arată codul QR')}
            </button>
            <CopiedNote copied={teacherCopied} />
          </Way>
        )}
      </ul>
      {error !== null && <ErrorMessage error={error} />}
      {shown === 'students' && (
        <QrWindow
          title={t('Linkul testului pentru elevi')}
          hint={t('Elevul scanează codul cu camera telefonului și trimite pozele.')}
          url={url}
          returnFocus={studentsQr}
          fullScreen={() => {
            setShown(null);
            setFullScreen(true);
          }}
          onClose={() => setShown(null)}
        />
      )}
      {shown === 'teacher' && teacherUrl !== null && (
        <QrWindow
          title={t('Linkul tău pentru mai multe lucrări')}
          hint={t('Scanează-l cu telefonul tău. Încarci pe rând lucrările elevilor fără telefon. Nu-l arăta clasei.')}
          url={teacherUrl}
          returnFocus={teacherQr}
          onClose={() => setShown(null)}
        />
      )}
      {fullScreen && (
        <QrOverlay
          url={url}
          onClose={() => {
            setFullScreen(false);
            studentsQr.current?.focus();
          }}
        />
      )}
    </StageSection>
  );
}
