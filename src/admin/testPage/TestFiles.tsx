import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import type { TestInfo } from '../../../shared/api.ts';
import type { TestFileKind } from '../../../shared/files.ts';
import { testFileUrl } from '../api.ts';
import { useApi } from '../ApiContext.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';
import { TestFileInput } from '../TestFileInput.tsx';

const NAMES: Record<TestFileKind, { title: string; upload: string; replace: string }> = {
  test: { title: 'Testul', upload: 'Încarcă testul', replace: 'Înlocuiește testul' },
  barem: { title: 'Baremul', upload: 'Încarcă baremul', replace: 'Înlocuiește baremul' },
};

// The test and the barem: open them, upload them, or replace them. Not while
// the robot grades with them; while their exercise list has a problem or
// failed, the robot uses neither, and the teacher may fix them.
export function TestFiles({ test, onChanged }: { test: TestInfo; onChanged: () => Promise<void> }) {
  const listBlocked = test.exerciseList.status === 'problem' || test.exerciseList.status === 'failed';
  const locked = test.status === 'evaluating' && !listBlocked;
  return (
    <>
      <h2>Fișiere</h2>
      {locked && <p className="hint">Testul se corectează acum. Poți schimba fișierele după ce se termină corectarea.</p>}
      <ul className="file-list">
        <TestFileRow code={test.code} kind="test" file={test.files.test} locked={locked} onChanged={onChanged} />
        <TestFileRow code={test.code} kind="barem" file={test.files.barem} locked={locked} onChanged={onChanged} />
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
}: {
  code: string;
  kind: TestFileKind;
  file: TestInfo['files'][TestFileKind];
  locked: boolean;
  onChanged: () => Promise<void>;
}) {
  const api = useApi();
  // A new key empties the file input after each upload.
  const [round, setRound] = useState(0);
  const upload = useMutation({
    mutationFn: (picked: File) => api.uploadTestFile(code, kind, picked),
    onSuccess: async () => {
      setRound((value) => value + 1);
      await onChanged();
    },
  });
  const names = NAMES[kind];

  return (
    <li>
      <strong>{names.title}:</strong>{' '}
      {file ? (
        <a href={testFileUrl(code, kind)} target="_blank" rel="noopener">
          {file.name}
        </a>
      ) : (
        <span className="hint">lipsește</span>
      )}
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
    </li>
  );
}
