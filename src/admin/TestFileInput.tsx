import { useState } from 'react';
import { DOCX_TYPE, fileProblem, PDF_TYPE, TEACHER_FILE_TYPES, TEACHER_WRONG_TYPE } from '../../shared/files.ts';

const ACCEPT = ['.pdf', '.docx', PDF_TYPE, DOCX_TYPE].join(',');

// Picks the test or the barem: a PDF or Word file of at most 25 MB. A file
// that cannot be sent shows its problem here and is not passed on.
export function TestFileInput({
  id,
  label,
  onPick,
  disabled = false,
}: {
  id: string;
  label: string;
  onPick: (file: File | null) => void;
  disabled?: boolean;
}) {
  const [problem, setProblem] = useState<string | null>(null);
  return (
    <div className="file-field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="file"
        accept={ACCEPT}
        disabled={disabled}
        onChange={(event) => {
          const file = event.target.files?.[0] ?? null;
          const found = file ? fileProblem(file, TEACHER_FILE_TYPES, TEACHER_WRONG_TYPE) : null;
          setProblem(found);
          onPick(found ? null : file);
        }}
      />
      {problem && (
        <p className="alert" role="alert">
          {problem}
        </p>
      )}
    </div>
  );
}
