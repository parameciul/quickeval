import { useState, type ReactNode } from 'react';
import { t } from '../i18n/t.ts';
import { ActionIcon } from '../ui/ActionIcon.tsx';
import { TEACHER_PICK_ACCEPT, type MakePdf } from '../ui/picturesPdf.ts';
import { useTeacherPick } from '../ui/useTeacherPick.ts';
import { chosenName } from './newTest/FileDrop.tsx';

// Picks the test or the barem: a PDF or Word file of at most 25 MB, or photos
// of the pages, made into one PDF. A file that cannot be sent shows its problem
// here and is not passed on. The button, the actions after it and the picked
// name share one line, and the name wraps below on a phone. `confirm` runs
// after a valid pick, with the name of the file that would be sent, before any
// photo is read: false drops the pick.
export function TestFileInput({
  id,
  label,
  onPick,
  disabled = false,
  actions,
  confirm,
  makePdf,
}: {
  id: string;
  label: string;
  onPick: (file: File | null) => void;
  disabled?: boolean;
  actions?: ReactNode;
  confirm?: (name: string) => boolean;
  makePdf?: MakePdf;
}) {
  const [problem, setProblem] = useState<string | null>(null);
  const [name, setName] = useState<string | null>(null);
  const { take, busy } = useTeacherPick(makePdf);
  return (
    <div className="file-field">
      <input
        id={id}
        type="file"
        className="sr-only"
        accept={TEACHER_PICK_ACCEPT}
        multiple
        disabled={disabled || busy}
        onChange={(event) => {
          const input = event.target;
          setProblem(null);
          take(
            [...(input.files ?? [])],
            (outcome) => {
              const file = 'file' in outcome ? outcome.file : null;
              if ('problem' in outcome) setProblem(outcome.problem);
              // Emptied, so the same pick can be made again after a no.
              if (!file) input.value = '';
              setName(file ? chosenName(file, 'pictures' in outcome ? outcome.pictures : 0) : null);
              onPick(file);
            },
            confirm,
          );
        }}
      />
      <label htmlFor={id} className="button-quiet button-small file-pick">
        <ActionIcon name="upload" />
        {label}
      </label>
      {actions}
      <span className="file-chosen">{busy ? t('Se pregătesc pozele…') : name}</span>
      {problem && (
        <p className="alert" role="alert">
          {problem}
        </p>
      )}
    </div>
  );
}
