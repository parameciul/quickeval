import { useState, type ReactNode } from 'react';
import { DOCX_TYPE, fileProblem, PDF_TYPE, TEACHER_FILE_TYPES, TEACHER_WRONG_TYPE } from '../../shared/files.ts';

const ACCEPT = ['.pdf', '.docx', PDF_TYPE, DOCX_TYPE].join(',');

// Picks the test or the barem: a PDF or Word file of at most 25 MB. A file
// that cannot be sent shows its problem here and is not passed on. The button,
// the actions after it and the picked name share one line, and the name wraps
// below on a phone. `confirm` runs after a valid pick: false drops the pick.
export function TestFileInput({
  id,
  label,
  onPick,
  disabled = false,
  actions,
  confirm,
}: {
  id: string;
  label: string;
  onPick: (file: File | null) => void;
  disabled?: boolean;
  actions?: ReactNode;
  confirm?: (file: File) => boolean;
}) {
  const [problem, setProblem] = useState<string | null>(null);
  const [name, setName] = useState<string | null>(null);
  return (
    <div className="file-field">
      <input
        id={id}
        type="file"
        className="sr-only"
        accept={ACCEPT}
        disabled={disabled}
        onChange={(event) => {
          const input = event.target;
          let file = input.files?.[0] ?? null;
          const found = file ? fileProblem(file, TEACHER_FILE_TYPES, TEACHER_WRONG_TYPE) : null;
          setProblem(found);
          if (found) file = null;
          if (file && confirm && !confirm(file)) {
            input.value = '';
            file = null;
          }
          setName(file ? file.name : null);
          onPick(file);
        }}
      />
      <label htmlFor={id} className="button-quiet button-small file-pick">
        {label}
      </label>
      {actions}
      <span className="file-chosen">{name}</span>
      {problem && (
        <p className="alert" role="alert">
          {problem}
        </p>
      )}
    </div>
  );
}
