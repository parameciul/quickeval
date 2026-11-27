import { useEffect, useState, type ChangeEvent, type ReactNode } from 'react';
import { EMPTY_FILE, TEACHER_FILE_TYPES, uploadTypeOf } from '../../shared/files.ts';
import { translateMessage } from '../../shared/i18n/messages.ts';
import { ErrorMessage } from '../admin/ErrorMessage.tsx';
import { ActionIcon } from '../ui/ActionIcon.tsx';
import { formatFileSize } from '../ui/format.ts';
import { MAX_PICTURES, PICTURE_TYPES, picturesToPdf, TEACHER_PICK_ACCEPT } from '../ui/picturesPdf.ts';
import { previewPhoto } from './shrink.ts';
import { t, tc } from '../i18n/t.ts';

const isPicture = (file: File) => PICTURE_TYPES.includes(uploadTypeOf(file));
const isDocument = (file: File) => TEACHER_FILE_TYPES.includes(uploadTypeOf(file));

// A test or a barem taken with the phone: photos one by one (kept here, in the
// order taken, which a phone's camera names do not give), or one PDF or Word
// file, sent once as one file (the photos made into one PDF named `pdfName`).
// `onSend` sends it; what it throws shows under the photos. A Quick Try's
// phone page and a teacher's phone page draw it under their own heading.
export function PhotoSend({
  pdfName,
  sendLabel,
  arrow,
  locked,
  onSend,
  onBusy,
  children,
}: {
  pdfName: string;
  sendLabel: string;
  // The send also moves on to the next step.
  arrow: boolean;
  // Why nothing can be sent any more, or null.
  locked: string | null;
  onSend: (file: File) => Promise<void>;
  onBusy: (busy: boolean) => void;
  // The other buttons, after the send, given whether a send is on its way.
  children?: (sending: boolean) => ReactNode;
}) {
  const [photos, setPhotos] = useState<File[]>([]);
  const [doc, setDoc] = useState<File | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  useEffect(() => {
    onBusy(sending);
  }, [sending, onBusy]);
  useEffect(() => () => onBusy(false), [onBusy]);

  const add = (event: ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (picked.length === 0) return;
    setProblem(null);
    if (picked.every(isPicture)) {
      if (photos.length + picked.length > MAX_PICTURES) return setProblem(t('Alege cel mult {pictures}.', { pictures: tc(MAX_PICTURES, 'poză', 'poze') }));
      if (picked.some((file) => file.size === 0)) return setProblem(translateMessage(EMPTY_FILE));
      setDoc(null);
      setPhotos([...photos, ...picked]);
    } else if (picked.length === 1 && isDocument(picked[0]!)) {
      setPhotos([]);
      setDoc(picked[0]!);
    } else {
      setProblem(t('Încarcă un fișier PDF sau Word (.docx), ori poze JPG, PNG sau WebP.'));
    }
  };

  const send = async () => {
    setError(null);
    setProblem(null);
    setSending(true);
    try {
      let file = doc;
      if (!file) {
        const made = await picturesToPdf(photos, pdfName);
        if ('problem' in made) {
          setProblem(made.problem);
          return;
        }
        file = made.file;
      }
      await onSend(file);
    } catch (err) {
      setError(err);
    } finally {
      setSending(false);
    }
  };

  const count = doc ? 1 : photos.length;
  return (
    <>
      <div className="big-actions">
        <label className="button button-big pick-button">
          <ActionIcon name="camera" />
          {t('Fă o poză')}
          <input type="file" accept="image/*" capture="environment" className="sr-only" disabled={sending} onChange={add} />
        </label>
        <label className="button-quiet button-big pick-button">
          <ActionIcon name="upload" />
          {t('Alege fișiere')}
          <input type="file" accept={TEACHER_PICK_ACCEPT} multiple className="sr-only" disabled={sending} onChange={add} />
        </label>
      </div>
      <p className="hint">{t('Poze sau un fișier PDF ori Word.')}</p>
      {problem && (
        <p className="alert" role="alert">
          {problem}
        </p>
      )}
      {doc && (
        <ol className="page-list">
          <li className="page-item">
            <span className="thumb thumb-file" aria-hidden="true">
              {uploadTypeOf(doc) === 'application/pdf' ? 'PDF' : 'DOC'}
            </span>
            <span className="page-info">
              <span className="page-name">{doc.name}</span>
              <span className="hint">{formatFileSize(doc.size)}</span>
            </span>
            <span className="page-actions">
              <button type="button" className="button-quiet button-small" disabled={sending} onClick={() => setDoc(null)}>
                {t('Șterge')}
              </button>
            </span>
          </li>
        </ol>
      )}
      {photos.length > 0 && (
        <ol className="phone-shots" aria-label={t('Pozele ({length})', { length: photos.length })}>
          {photos.map((photo, index) => (
            <li key={`${index}-${photo.name}-${photo.size}`}>
              <Shot photo={photo} label={t('Poza {n}', { n: index + 1 })} />
              <button
                type="button"
                className="phone-shot-remove"
                aria-label={t('Șterge poza {n}', { n: index + 1 })}
                title={t('Șterge poza {n}', { n: index + 1 })}
                disabled={sending}
                onClick={() => setPhotos(photos.filter((_, other) => other !== index))}
              >
                <ActionIcon name="trash" />
              </button>
            </li>
          ))}
        </ol>
      )}
      {error !== null && <ErrorMessage error={error} />}
      <div className="phone-foot">
        <button type="button" className="button button-big" disabled={count === 0 || sending || locked !== null} onClick={() => void send()}>
          {sending ? t('Se trimite…') : sendLabel}
          {!sending && arrow && <ActionIcon name="arrow" />}
        </button>
        {locked && <p className="hint">{locked}</p>}
        {children?.(sending)}
      </div>
    </>
  );
}

// A photo taken, made small for its preview: a phone's memory holds a few
// small pictures, not twenty camera photos decoded at once.
function Shot({ photo, label }: { photo: File; label: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    let url: string | null = null;
    void previewPhoto(photo).then((small) => {
      if (!live) return;
      url = URL.createObjectURL(small);
      setSrc(url);
    });
    return () => {
      live = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [photo]);
  return src ? <img src={src} alt={label} /> : <span className="thumb-file">{label}</span>;
}
