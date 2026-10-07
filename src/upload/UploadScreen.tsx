import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';
import type { SubmissionFile } from '../../shared/api.ts';
import {
  EMPTY_FILE,
  FILE_TOO_BIG,
  JPEG_TYPE,
  MAX_FILE_BYTES,
  MAX_STUDENT_FILES,
  PDF_TYPE,
  STUDENT_FILE_TYPES,
  STUDENT_WRONG_TYPE,
  uploadTypeOf,
} from '../../shared/files.ts';
import { ApiError, messageOf } from '../ui/ApiError.ts';
import { formatFileSize } from '../ui/format.ts';
import type { ActiveSession, UploadApi } from './api.ts';
import { PhotoViewer } from './PhotoViewer.tsx';
import { forgetSecret } from './session.ts';
import { jpegName, shrinkPhoto } from './shrink.ts';

const PICK_ACCEPT = [...STUDENT_FILE_TYPES, '.jpg', '.jpeg', '.png', '.webp', '.pdf'].join(',');
const TOO_MANY = `Poți trimite cel mult ${MAX_STUDENT_FILES} de fișiere.`;

// One page of the student's work, on its way to the server or already there.
interface PageItem {
  key: string;
  name: string;
  contentType: string;
  size: number;
  fileId: number | null;
  state: 'waiting' | 'sending' | 'sent' | 'failed';
  progress: number;
  error: string | null;
  // Failed only because of the network or the server: the same file can be sent again.
  canRetry: boolean;
  preview: string | null;
}

let nextKey = 1;

function sentItem(file: SubmissionFile): PageItem {
  return {
    key: `server-${file.id}`,
    name: file.name,
    contentType: file.contentType,
    size: file.size,
    fileId: file.id,
    state: 'sent',
    progress: 1,
    error: null,
    canRetry: false,
    preview: null,
  };
}

// The upload screen: photo tips, the camera and file buttons, the list of
// pages with their progress, and "Am trimis tot". Pages are sent one at a time,
// in the order they were picked.
export function UploadScreen({
  api,
  token,
  session,
  onSent,
  onLost,
  shrink = shrinkPhoto,
}: {
  api: UploadApi;
  token: string;
  session: ActiveSession;
  onSent: (fileCount: number) => void;
  onLost: (message: string) => void;
  shrink?: (file: File) => Promise<Blob>;
}) {
  const [items, setItems] = useState<PageItem[]>(() => session.files.map(sentItem));
  const [notice, setNotice] = useState<string | null>(null);
  const [viewingKey, setViewingKey] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  // The file of each page that is not on the server yet; `ready` once it was made smaller.
  const sources = useRef(new Map<string, { blob: Blob; ready: boolean }>());
  const queue = useRef<Promise<void>>(Promise.resolve());
  const previews = useRef<string[]>([]);
  // Set when the screen goes away or the upload is lost: pages still waiting are not sent.
  const stopped = useRef(false);

  const update = useCallback((key: string, changes: Partial<PageItem>) => {
    setItems((current) => current.map((item) => (item.key === key ? { ...item, ...changes } : item)));
  }, []);

  const previewOf = useCallback((blob: Blob) => {
    const url = URL.createObjectURL(blob);
    previews.current.push(url);
    return url;
  }, []);

  // Pages already on the server (after a reload): their photos come back for the preview.
  useEffect(() => {
    let current = true;
    for (const file of session.files) {
      if (!file.contentType.startsWith('image/')) continue;
      api
        .fileBlob(token, session.secret, file.id)
        .then((blob) => {
          if (current) update(`server-${file.id}`, { preview: previewOf(blob) });
        })
        .catch(() => {
          // No preview: the page is still on the server.
        });
    }
    return () => {
      current = false;
    };
  }, [api, token, session, update, previewOf]);

  useEffect(
    () => () => {
      for (const url of previews.current) URL.revokeObjectURL(url);
    },
    [],
  );

  useEffect(() => {
    stopped.current = false;
    return () => {
      stopped.current = true;
    };
  }, []);

  const send = useCallback(
    async (key: string, name: string) => {
      const source = sources.current.get(key);
      if (!source || stopped.current) return;
      update(key, { state: 'sending', progress: 0, error: null });
      try {
        let { blob } = source;
        let fileName = name;
        if (!source.ready) {
          const original = blob as File;
          blob = await shrink(original);
          if (stopped.current) return;
          if (blob !== original) fileName = jpegName(name);
          else if (blob.type !== uploadTypeOf(original)) blob = new Blob([blob], { type: uploadTypeOf(original) });
          const problem = blob.size === 0 ? EMPTY_FILE : blob.size > MAX_FILE_BYTES ? FILE_TOO_BIG : null;
          if (problem) {
            sources.current.delete(key);
            update(key, { state: 'failed', error: problem, canRetry: false });
            return;
          }
          sources.current.set(key, { blob, ready: true });
          update(key, {
            name: fileName,
            size: blob.size,
            contentType: blob.type,
            preview: blob.type.startsWith('image/') ? previewOf(blob) : null,
          });
        }
        const stored = await api.uploadFile(token, session.secret, blob, fileName, (sent) => update(key, { progress: sent }));
        sources.current.delete(key);
        update(key, { state: 'sent', progress: 1, fileId: stored.id });
      } catch (err) {
        if (stopped.current) return;
        if (err instanceof ApiError && err.status === 401) {
          stopped.current = true;
          onLost(err.message);
          return;
        }
        // A page that could not be prepared or sent can be tried again.
        update(key, { state: 'failed', error: messageOf(err), canRetry: true });
      }
    },
    [api, token, session.secret, shrink, update, previewOf, onLost],
  );

  const enqueue = (key: string, name: string) => {
    // One page at a time; a page that fails never stops the pages after it.
    queue.current = queue.current.then(() => send(key, name)).catch(() => undefined);
  };

  const addFiles = (event: ChangeEvent<HTMLInputElement>) => {
    const picked = [...(event.target.files ?? [])];
    event.target.value = '';
    const problems: string[] = [];
    const room = MAX_STUDENT_FILES - items.length;
    if (picked.length > room) problems.push(TOO_MANY);
    const added: PageItem[] = [];
    for (const file of picked.slice(0, Math.max(0, room))) {
      const type = uploadTypeOf(file);
      if (!STUDENT_FILE_TYPES.includes(type)) {
        problems.push(`${file.name}: ${STUDENT_WRONG_TYPE}`);
        continue;
      }
      const key = `local-${nextKey++}`;
      sources.current.set(key, { blob: file, ready: false });
      added.push({
        key,
        name: file.name,
        contentType: type,
        size: file.size,
        fileId: null,
        state: 'waiting',
        progress: 0,
        error: null,
        canRetry: false,
        preview: null,
      });
    }
    setNotice(problems.length > 0 ? problems.join(' ') : null);
    setItems((current) => [...current, ...added]);
    for (const item of added) enqueue(item.key, item.name);
  };

  const remove = async (item: PageItem) => {
    if (item.fileId !== null) {
      try {
        await api.deleteFile(token, session.secret, item.fileId);
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) onLost(err.message);
        else setNotice(messageOf(err));
        return;
      }
    }
    sources.current.delete(item.key);
    setItems((current) => current.filter((other) => other.key !== item.key));
  };

  const confirm = async () => {
    if (!window.confirm('Ești sigur? După confirmare nu mai poți schimba nimic.')) return;
    setConfirming(true);
    try {
      const { fileCount } = await api.confirm(token, session.secret);
      forgetSecret(token, session.studentId);
      onSent(fileCount);
    } catch (err) {
      setConfirming(false);
      if (err instanceof ApiError && err.status === 401) onLost(err.message);
      else setNotice(messageOf(err));
    }
  };

  const allSent = items.length > 0 && items.every((item) => item.state === 'sent');
  const hasFailed = items.some((item) => item.state === 'failed');
  const viewingIndex = items.findIndex((item) => item.key === viewingKey);
  const viewing = viewingIndex >= 0 ? items[viewingIndex] : undefined;

  return (
    <section>
      <h2>{session.studentName}</h2>

      <details className="tips" open={items.length === 0}>
        <summary>Cum faci poze bune</summary>
        <ul>
          <li>Fă pozele la lumină bună, fără umbre pe foaie.</li>
          <li>Prinde toată pagina în poză.</li>
          <li>O singură pagină pe fiecare poză.</li>
          <li>Pune paginile în ordine: prima pagină prima.</li>
        </ul>
      </details>

      <div className="big-actions">
        <label className="button button-big pick-button">
          Fă o poză
          <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={addFiles} />
        </label>
        <label className="button-quiet button-big pick-button">
          Alege fișiere
          <input type="file" accept={PICK_ACCEPT} multiple className="sr-only" onChange={addFiles} />
        </label>
      </div>
      <p className="hint">Poze JPG, PNG sau PDF, cel mult {MAX_STUDENT_FILES} de fișiere.</p>

      {notice && (
        <p className="alert" role="alert">
          {notice}
        </p>
      )}

      <h3>Paginile tale ({items.length})</h3>
      {items.length === 0 ? (
        <p className="hint">Nu ai adăugat încă nicio pagină.</p>
      ) : (
        <ol className="page-list">
          {items.map((item, index) => (
            <li key={item.key} className={`page-item is-${item.state}`}>
              {item.preview ? (
                <button type="button" className="thumb" onClick={() => setViewingKey(item.key)} aria-label={`Vezi pagina ${index + 1}`}>
                  <img src={item.preview} alt={`Pagina ${index + 1}`} />
                </button>
              ) : (
                <span className="thumb thumb-file" aria-hidden="true">
                  {item.contentType === PDF_TYPE ? 'PDF' : item.contentType === JPEG_TYPE ? 'JPG' : 'Poză'}
                </span>
              )}
              <span className="page-info">
                <span className="page-name">{item.name}</span>
                <span className="hint">{formatFileSize(item.size)}</span>
                {item.state === 'waiting' && <span>Așteaptă…</span>}
                {item.state === 'sending' && (
                  <span>
                    Se încarcă… {Math.round(item.progress * 100)}%
                    <progress max={1} value={item.progress} aria-label={`Se încarcă ${item.name}`} />
                  </span>
                )}
                {item.state === 'sent' && <span className="page-ok">Încărcat</span>}
                {item.state === 'failed' && <span className="page-error">{item.error}</span>}
              </span>
              <span className="page-actions">
                {item.state === 'failed' && item.canRetry && (
                  <button
                    type="button"
                    className="button button-small"
                    onClick={() => {
                      update(item.key, { state: 'waiting', error: null });
                      enqueue(item.key, item.name);
                    }}
                  >
                    Încearcă din nou
                  </button>
                )}
                {item.state !== 'sending' && item.state !== 'waiting' && (
                  <button type="button" className="button-quiet button-small" onClick={() => remove(item)} aria-label={`Șterge pagina ${index + 1}`}>
                    Șterge
                  </button>
                )}
              </span>
            </li>
          ))}
        </ol>
      )}

      <div className="send-all">
        {hasFailed && <p className="hint">Încearcă din nou sau șterge paginile cu eroare.</p>}
        {!hasFailed && items.length > 0 && !allSent && <p className="hint">Așteaptă să se încarce toate paginile.</p>}
        <button type="button" className="button button-big" disabled={!allSent || confirming} onClick={confirm}>
          Am trimis tot
        </button>
      </div>

      {viewing?.preview && (
        <PhotoViewer src={viewing.preview} label={`Pagina ${viewingIndex + 1}`} onClose={() => setViewingKey(null)} />
      )}
    </section>
  );
}
