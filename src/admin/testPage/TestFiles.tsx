import { useMutation } from '@tanstack/react-query';
import { useState, type FormEvent, type ReactNode } from 'react';
import { MAX_BAREM_NOTES_LENGTH, type RobotStart, type TestInfo } from '../../../shared/api.ts';
import type { TestFileKind, TestVariant } from '../../../shared/files.ts';
import { testFileUrl } from '../api.ts';
import { useApi } from '../ApiContext.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';
import { missingOf, type MissingPart } from '../missing.ts';
import { TestFileInput } from '../TestFileInput.tsx';
import { useGeneratedBarem } from './GeneratedBarem.tsx';
import { partsOf } from './variant.ts';

// The part of the missing list (missingOf) that each file is.
const PART: Record<TestVariant, Record<TestFileKind, MissingPart>> = {
  class: { test: 'test', barem: 'barem' },
  ces: { test: 'cesTest', barem: 'cesBarem' },
};

const NAMES: Record<TestVariant, Record<TestFileKind, { title: string; upload: string; replace: string }>> = {
  class: {
    test: { title: 'Testul', upload: 'Încarcă testul', replace: 'Înlocuiește testul' },
    barem: { title: 'Baremul', upload: 'Încarcă baremul', replace: 'Înlocuiește baremul' },
  },
  ces: {
    test: { title: 'Testul CES', upload: 'Încarcă testul CES', replace: 'Înlocuiește testul CES' },
    barem: { title: 'Baremul CES', upload: 'Încarcă baremul CES', replace: 'Înlocuiește baremul CES' },
  },
};

// The test and the barem (the panel Pregătire of the test page): open them,
// upload them, or replace them. Not while the robot grades with them; while
// their exercise list has a problem or failed, the robot uses neither, and the
// teacher may fix them. A new barem during evaluation starts the robot, which
// makes the exercise list again. With `variant` "ces": the CES variant's own
// test and barem, which may change during the evaluation (the API refuses
// only while the robot grades a CES paper), and whose barem can be generated
// until the test is done.
export function TestFiles({
  test,
  variant = 'class',
  onChanged,
  onRobot,
}: {
  test: TestInfo;
  variant?: TestVariant;
  onChanged: () => Promise<void>;
  onRobot: (robot: RobotStart | null) => void;
}) {
  const parts = partsOf(test, variant);
  const missing = missingOf(test);
  const listBlocked = test.exerciseList.status === 'problem' || test.exerciseList.status === 'failed';
  const locked = variant === 'class' && test.status === 'evaluating' && !listBlocked;
  const generated = useGeneratedBarem({ test, variant, onChanged, onRobot });
  // Before the uploads close (and, for the CES barem, until the test is done): the barem can be generated.
  const canGenerate = test.status === 'draft' || test.status === 'open' || (variant === 'ces' && test.status === 'evaluating');
  return (
    <>
      {locked && <p className="hint">Testul se corectează acum. Poți schimba fișierele după ce se termină corectarea.</p>}
      <ul className="file-list">
        <TestFileRow
          code={test.code}
          variant={variant}
          kind="test"
          file={parts.files.test}
          missing={missing.includes(PART[variant].test)}
          locked={locked}
          onChanged={onChanged}
          onRobot={onRobot}
        />
        <TestFileRow
          code={test.code}
          variant={variant}
          kind="barem"
          file={parts.files.barem}
          missing={missing.includes(PART[variant].barem)}
          unchecked={parts.barem.unchecked}
          locked={locked}
          onChanged={onChanged}
          onRobot={onRobot}
          baremNotes={parts.baremNotes}
          actions={canGenerate ? generated.buttons : undefined}
          status={canGenerate ? generated.status : undefined}
        />
      </ul>
    </>
  );
}

function TestFileRow({
  code,
  variant,
  kind,
  file,
  missing,
  unchecked = false,
  locked,
  onChanged,
  onRobot,
  baremNotes,
  actions,
  status,
}: {
  code: string;
  variant: TestVariant;
  kind: TestFileKind;
  file: TestInfo['files'][TestFileKind];
  // A draft or open test needs this file (missingOf): an orange mark.
  missing: boolean;
  // A generated barem that waits for the teacher's check: orange, not "gata".
  unchecked?: boolean;
  locked: boolean;
  onChanged: () => Promise<void>;
  onRobot: (robot: RobotStart | null) => void;
  baremNotes?: string;
  actions?: ReactNode;
  status?: ReactNode;
}) {
  const api = useApi();
  // A new key empties the file input after each upload.
  const [round, setRound] = useState(0);
  const upload = useMutation({
    mutationFn: (picked: File) => api.uploadTestFile(code, kind, picked, variant),
    onSuccess: async (answer) => {
      setRound((value) => value + 1);
      onRobot(answer.robot);
      await onChanged();
    },
  });
  const names = NAMES[variant][kind];

  return (
    <li>
      <p className="file-title">
        <strong>{names.title}:</strong>{' '}
        {file ? (
          <>
            <a href={testFileUrl(code, kind, variant)} target="_blank" rel="noopener">
              {file.name}
            </a>{' '}
            {unchecked ? <span className="file-mark is-missing">de verificat</span> : <span className="file-mark is-ready">gata</span>}
          </>
        ) : missing ? (
          <span className="file-mark is-missing">lipsește</span>
        ) : (
          <span className="hint">lipsește</span>
        )}
      </p>
      <TestFileInput
        key={round}
        id={variant === 'ces' ? `file-ces-${kind}` : `file-${kind}`}
        label={file ? names.replace : names.upload}
        disabled={locked || upload.isPending}
        actions={actions}
        confirm={
          kind === 'barem' && file
            ? (picked) => window.confirm(`Înlocuiești ${variant === 'ces' ? 'baremul CES' : 'baremul'} existent cu ${picked.name}?`)
            : undefined
        }
        onPick={(picked) => {
          if (picked) upload.mutate(picked);
        }}
      />
      {upload.isPending && <p role="status">Se încarcă…</p>}
      {upload.error && <ErrorMessage error={upload.error} />}
      {status}
      {kind === 'barem' && (
        <BaremNotesEditor code={code} variant={variant} notes={baremNotes ?? ''} locked={locked} onChanged={onChanged} onRobot={onRobot} />
      )}
    </li>
  );
}

// Extra teacher comments for the barem: the robot reads them as part of the
// barem, so the teacher need not replace the barem file. Like a new barem,
// saving them clears the exercise list and starts the robot during evaluation.
function BaremNotesEditor({
  code,
  variant,
  notes,
  locked,
  onChanged,
  onRobot,
}: {
  code: string;
  variant: TestVariant;
  notes: string;
  locked: boolean;
  onChanged: () => Promise<void>;
  onRobot: (robot: RobotStart | null) => void;
}) {
  const api = useApi();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(notes);
  const ces = variant === 'ces';
  const save = useMutation({
    mutationFn: () => api.saveBaremNotes(code, text, variant),
    onSuccess: async (answer) => {
      setOpen(false);
      onRobot(answer.robot);
      await onChanged();
    },
  });

  if (!open) {
    return (
      <>
        {notes && (
          <p className="hint">
            {ces ? 'Comentarii la baremul CES' : 'Comentarii la barem'}: {notes}
          </p>
        )}
        <button
          type="button"
          className="button-quiet button-small"
          disabled={locked}
          onClick={() => {
            setText(notes);
            setOpen(true);
          }}
        >
          {notes ? 'Editează comentariile' : 'Adaugă comentarii'}
        </button>
      </>
    );
  }
  return (
    <form
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        save.mutate();
      }}
    >
      <label htmlFor={ces ? 'ces-barem-notes' : 'barem-notes'}>{ces ? 'Comentarii la baremul CES' : 'Comentarii la barem'}</label>
      <textarea
        id={ces ? 'ces-barem-notes' : 'barem-notes'}
        value={text}
        onChange={(event) => setText(event.target.value)}
        maxLength={MAX_BAREM_NOTES_LENGTH}
        rows={4}
        placeholder="De exemplu: la exercițiul 2 acceptă și metoda cu proporții."
      />
      <p className="hint">Robotul le citește ca parte din barem.</p>
      <span className="row-actions">
        <button className="button button-small" type="submit" disabled={save.isPending}>
          Salvează comentariile
        </button>
        <button type="button" className="button-quiet button-small" onClick={() => setOpen(false)}>
          Renunță
        </button>
      </span>
      {save.error && <ErrorMessage error={save.error} />}
    </form>
  );
}
