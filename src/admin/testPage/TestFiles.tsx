import { useMutation } from '@tanstack/react-query';
import { useState, type FormEvent, type ReactNode } from 'react';
import { MAX_BAREM_NOTES_LENGTH, type RobotStart, type TestInfo } from '../../../shared/api.ts';
import type { TestFileKind } from '../../../shared/files.ts';
import { testFileUrl } from '../api.ts';
import { useApi } from '../ApiContext.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';
import { TestFileInput } from '../TestFileInput.tsx';
import { PrintTest } from './PrintTest.tsx';

const NAMES: Record<TestFileKind, { title: string; upload: string; replace: string }> = {
  test: { title: 'Testul', upload: 'Încarcă testul', replace: 'Înlocuiește testul' },
  barem: { title: 'Baremul', upload: 'Încarcă baremul', replace: 'Înlocuiește baremul' },
};

// The test and the barem: open them, upload them, or replace them. Not while
// the robot grades with them; while their exercise list has a problem or
// failed, the robot uses neither, and the teacher may fix them. A new barem
// during evaluation starts the robot, which makes the exercise list again.
// While the test is open, the test with the QR code shows under the test file.
export function TestFiles({
  test,
  onChanged,
  onRobot,
}: {
  test: TestInfo;
  onChanged: () => Promise<void>;
  onRobot: (robot: RobotStart | null) => void;
}) {
  const listBlocked = test.exerciseList.status === 'problem' || test.exerciseList.status === 'failed';
  const locked = test.status === 'evaluating' && !listBlocked;
  return (
    <>
      <h2>Fișiere</h2>
      {locked && <p className="hint">Testul se corectează acum. Poți schimba fișierele după ce se termină corectarea.</p>}
      <ul className="file-list">
        <TestFileRow code={test.code} kind="test" file={test.files.test} locked={locked} onChanged={onChanged} onRobot={onRobot}>
          {test.status === 'open' && <PrintTest test={test} onChanged={onChanged} onRobot={onRobot} />}
        </TestFileRow>
        <TestFileRow
          code={test.code}
          kind="barem"
          file={test.files.barem}
          locked={locked}
          onChanged={onChanged}
          onRobot={onRobot}
          baremNotes={test.baremNotes}
        />
      </ul>
    </>
  );
}

function TestFileRow({
  code,
  kind,
  file,
  locked,
  onChanged,
  onRobot,
  baremNotes,
  children,
}: {
  code: string;
  kind: TestFileKind;
  file: TestInfo['files'][TestFileKind];
  locked: boolean;
  onChanged: () => Promise<void>;
  onRobot: (robot: RobotStart | null) => void;
  baremNotes?: string;
  children?: ReactNode;
}) {
  const api = useApi();
  // A new key empties the file input after each upload.
  const [round, setRound] = useState(0);
  const upload = useMutation({
    mutationFn: (picked: File) => api.uploadTestFile(code, kind, picked),
    onSuccess: async (answer) => {
      setRound((value) => value + 1);
      onRobot(answer.robot);
      await onChanged();
    },
  });
  const names = NAMES[kind];

  return (
    <li>
      <p className="file-title">
        <strong>{names.title}:</strong>{' '}
        {file ? (
          <a href={testFileUrl(code, kind)} target="_blank" rel="noopener">
            {file.name}
          </a>
        ) : (
          <span className="hint">lipsește</span>
        )}
      </p>
      <TestFileInput
        key={round}
        id={`file-${kind}`}
        label={file ? names.replace : names.upload}
        disabled={locked || upload.isPending}
        onPick={(picked) => {
          if (picked) upload.mutate(picked);
        }}
      />
      {upload.isPending && <p role="status">Se încarcă…</p>}
      {upload.error && <ErrorMessage error={upload.error} />}
      {kind === 'barem' && (
        <BaremNotesEditor code={code} notes={baremNotes ?? ''} locked={locked} onChanged={onChanged} onRobot={onRobot} />
      )}
      {children}
    </li>
  );
}

// Extra teacher comments for the barem: the robot reads them as part of the
// barem, so the teacher need not replace the barem file. Like a new barem,
// saving them clears the exercise list and starts the robot during evaluation.
function BaremNotesEditor({
  code,
  notes,
  locked,
  onChanged,
  onRobot,
}: {
  code: string;
  notes: string;
  locked: boolean;
  onChanged: () => Promise<void>;
  onRobot: (robot: RobotStart | null) => void;
}) {
  const api = useApi();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(notes);
  const save = useMutation({
    mutationFn: () => api.saveBaremNotes(code, text),
    onSuccess: async (answer) => {
      setOpen(false);
      onRobot(answer.robot);
      await onChanged();
    },
  });

  if (!open) {
    return (
      <>
        {notes && <p className="hint">Comentarii la barem: {notes}</p>}
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
      <label htmlFor="barem-notes">Comentarii la barem</label>
      <textarea
        id="barem-notes"
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
