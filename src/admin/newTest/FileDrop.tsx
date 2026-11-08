import { useEffect, useState, type DragEvent } from 'react';
import { DOCX_TYPE, fileProblem, PDF_TYPE, TEACHER_FILE_TYPES, TEACHER_WRONG_TYPE } from '../../../shared/files.ts';

const ACCEPT = ['.pdf', '.docx', PDF_TYPE, DOCX_TYPE].join(',');

// A drop area for the test or the barem of "Test nou" (redesign spec §11.7):
// a click opens the file picker, and a file dragged onto it is taken too. A
// file goes through the check of `TestFileInput` (PDF or Word, at most
// 25 MB): one that cannot be sent shows its problem and is not passed on, and
// the file picked before it is dropped too. `name` says to a screen reader
// which file this is ("Fișierul testului"). While the area is shown, a file
// dropped beside it does nothing, so a near miss does not open the file in the
// tab and lose the form.
export function FileDrop({
  id,
  name,
  onPick,
  disabled = false,
}: {
  id: string;
  name: string;
  onPick: (file: File | null) => void;
  disabled?: boolean;
}) {
  const [problem, setProblem] = useState<string | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const problemId = `${id}-problem`;

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

  const take = (picked: File | null) => {
    const found = picked ? fileProblem(picked, TEACHER_FILE_TYPES, TEACHER_WRONG_TYPE) : null;
    const file = found ? null : picked;
    setProblem(found);
    setChosen(file ? file.name : null);
    onPick(file);
  };
  const onDragOver = (event: DragEvent) => {
    event.preventDefault();
    if (!disabled) setOver(true);
  };
  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setOver(false);
    // A dragged text or link carries no file: the file chosen before stays.
    const dropped = event.dataTransfer.files[0];
    if (!disabled && dropped) take(dropped);
  };

  return (
    <div className="file-drop-field">
      <input
        id={id}
        type="file"
        className="sr-only"
        accept={ACCEPT}
        disabled={disabled}
        aria-describedby={problem ? problemId : undefined}
        onChange={(event) => {
          take(event.target.files?.[0] ?? null);
          // Emptied, so picking the same file again (after a refused drop) is
          // still a change.
          event.target.value = '';
        }}
      />
      <label
        htmlFor={id}
        className={over ? 'file-drop is-over' : 'file-drop'}
        onDragOver={onDragOver}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
      >
        <svg width="22" height="22" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
          <path d="M10 13V3.5M6.5 7 10 3.5 13.5 7" />
          <path d="M3.5 13v3.5h13V13" />
        </svg>
        <span>
          <span className="sr-only">{name}: </span>
          <b>{chosen ? 'Alege alt fișier' : 'Alege fișierul'}</b> sau trage-l aici
        </span>
        {chosen && <span className="file-drop-name">{chosen}</span>}
      </label>
      {problem && (
        <p className="alert" role="alert" id={problemId}>
          {problem}
        </p>
      )}
    </div>
  );
}
