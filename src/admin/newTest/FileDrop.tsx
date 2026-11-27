import { useEffect, useRef, useState, type DragEvent } from 'react';
import { t, tc } from '../../i18n/t.ts';
import { TEACHER_PICK_ACCEPT, type MakePdf } from '../../ui/picturesPdf.ts';
import { useTeacherPick } from '../../ui/useTeacherPick.ts';

// A drop area for the test or the barem of "Test nou" (redesign spec §11.7),
// and for a missing file in Pregătire:
// a click opens the file picker, and a file dragged onto it is taken too. A
// file goes through the check of `TestFileInput` (one PDF or Word file, or
// photos of the pages, made into one PDF; at most 25 MB): one that cannot be
// sent shows its problem and is not passed on, and the file picked before it is
// dropped too. While photos are made into a PDF the area is off, and `onBusy`
// tells the page, whose form must not send without them. `name` says
// to a screen reader which file this is ("Fișierul testului"). While the area
// is shown, a file
// dropped beside it does nothing, so a near miss does not open the file in the
// tab and lose the form.
// With `tile`, it is drawn as a tile of one line (the look of the Quick Try
// form): `tile.title` and `tile.hint` while empty; once a file is chosen, its
// name, how many photos made it, and "Alege alt fișier", in green.
export function FileDrop({
  id,
  name,
  onPick,
  disabled = false,
  makePdf,
  onBusy,
  tile,
}: {
  id: string;
  name: string;
  onPick: (file: File | null) => void;
  disabled?: boolean;
  makePdf?: MakePdf;
  // Told when photos start and stop being made into a PDF, so a form can wait.
  onBusy?: (busy: boolean) => void;
  tile?: { title: string; hint: string };
}) {
  const [problem, setProblem] = useState<string | null>(null);
  const [chosen, setChosen] = useState<{ file: File; pictures: number } | null>(null);
  const [over, setOver] = useState(false);
  const problemId = `${id}-problem`;
  const { take: takeFiles, busy } = useTeacherPick(makePdf);
  const off = disabled || busy;
  const tellBusy = useRef(onBusy);
  tellBusy.current = onBusy;
  useEffect(() => {
    tellBusy.current?.(busy);
  }, [busy]);
  // A page that goes on waiting for a drop area that is gone would wait for ever.
  useEffect(() => () => tellBusy.current?.(false), []);

  useEffect(() => {
    const keepPage = (event: globalThis.DragEvent) => {
      if (event.dataTransfer?.types?.includes('Files')) event.preventDefault();
    };
    window.addEventListener('dragover', keepPage);
    window.addEventListener('drop', keepPage);
    return () => {
      window.removeEventListener('dragover', keepPage);
      window.removeEventListener('drop', keepPage);
    };
  }, []);

  const tileClass = ['pick-tile', chosen && 'is-chosen', over && 'is-over', problem && 'is-problem'].filter(Boolean).join(' ');
  const take = (picked: readonly File[]) => {
    setProblem(null);
    takeFiles(picked, (outcome) => {
      const found = 'problem' in outcome ? outcome.problem : null;
      const file = 'file' in outcome ? outcome.file : null;
      setProblem(found);
      setChosen(file ? { file, pictures: 'pictures' in outcome ? outcome.pictures : 0 } : null);
      onPick(file);
    });
  };
  const onDragOver = (event: DragEvent) => {
    event.preventDefault();
    if (!off) setOver(true);
  };
  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setOver(false);
    // A dragged text or link carries no file: the file chosen before stays.
    const dropped = [...event.dataTransfer.files];
    if (!off && dropped.length > 0) take(dropped);
  };

  return (
    <div className="file-drop-field">
      <input
        id={id}
        type="file"
        className="sr-only"
        accept={TEACHER_PICK_ACCEPT}
        multiple
        disabled={off}
        aria-describedby={problem ? problemId : undefined}
        onChange={(event) => {
          take([...(event.target.files ?? [])]);
          // Emptied, so picking the same file again (after a refused drop) is
          // still a change.
          event.target.value = '';
        }}
      />
      <label
        htmlFor={id}
        className={tile ? tileClass : over ? 'file-drop is-over' : 'file-drop'}
        onDragOver={onDragOver}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
      >
        {tile ? (
          <>
            <span className="pick-tile-icon">{chosen ? DONE_ICON : UPLOAD_ICON}</span>
            <span className="pick-tile-text">
              {/* The spaces keep the words apart in the name a screen reader reads. */}
              <span className="sr-only">{name}:</span>{' '}
              <b>{chosen ? chosen.file.name : tile.title}</b>{' '}
              {chosen ? chosen.pictures > 0 && <small>{t('Din {pictures}', { pictures: tc(chosen.pictures, 'poză', 'poze') })}</small> : <small>{tile.hint}</small>}
            </span>{' '}
            {chosen && <span className="pick-tile-go">{t('Alege alt fișier')}</span>}
          </>
        ) : (
          <>
            <svg width="22" height="22" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
              <path d="M10 13V3.5M6.5 7 10 3.5 13.5 7" />
              <path d="M3.5 13v3.5h13V13" />
            </svg>
            <span>
              <span className="sr-only">{name}: </span>
              <b>{chosen ? t('Alege alt fișier') : t('Alege fișierul')}</b>{' '}{t('sau trage-l aici')}
            </span>
            <span className="file-drop-types">{t('PDF, Word sau poze')}</span>
            {chosen && <span className="file-drop-name">{chosenName(chosen.file, chosen.pictures)}</span>}
          </>
        )}
      </label>
      {busy && (
        <p className="hint" role="status">
          {t('Se pregătesc pozele…')}
        </p>
      )}
      {problem && (
        <p className="alert" role="alert" id={problemId}>
          {problem}
        </p>
      )}
    </div>
  );
}

const UPLOAD_ICON = (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <path d="M10 13V4M6.5 7.5L10 4l3.5 3.5" />
    <path d="M3.5 13v3.25h13V13" />
  </svg>
);
const DONE_ICON = (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <path d="M4.5 10.5l3.5 3.5 7.5-8" />
  </svg>
);

// The name shown for the picked file: photos say how many they were.
export function chosenName(file: File, pictures: number): string {
  return pictures > 0 ? t('{name}, din {pictures}', { name: file.name, pictures: tc(pictures, 'poză', 'poze') }) : file.name;
}
