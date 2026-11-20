import { useMutation } from '@tanstack/react-query';
import { useState, type FormEvent, type ReactNode } from 'react';
import { MAX_BAREM_NOTES_LENGTH, type RobotStart, type TestInfo } from '../../../shared/api.ts';
import type { TestFileKind, TestVariant } from '../../../shared/files.ts';
import { testFileUrl } from '../api.ts';
import { useApi } from '../ApiContext.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';
import { missingOf, type MissingPart } from '../missing.ts';
import { FileDrop } from '../newTest/FileDrop.tsx';
import { TestFileInput } from '../TestFileInput.tsx';
import { useGeneratedBarem } from './GeneratedBarem.tsx';
import { partsOf } from './variant.ts';
import { ActionIcon } from '../../ui/ActionIcon.tsx';
import { t } from '../../i18n/t.ts';

// The part of the missing list (missingOf) that each file is.
const PART: Record<TestVariant, Record<TestFileKind, MissingPart>> = {
  class: { test: 'test', barem: 'barem' },
  ces: { test: 'cesTest', barem: 'cesBarem' },
};

// `drop` names the drop area of a missing file to a screen reader, as on Test nou.
const NAMES: Record<TestVariant, Record<TestFileKind, { title: string; drop: string; replace: string }>> = {
  class: {
    test: { title: t('Testul'), drop: t('Fișierul testului'), replace: t('Înlocuiește testul') },
    barem: { title: t('Baremul'), drop: t('Fișierul baremului'), replace: t('Înlocuiește baremul') },
  },
  ces: {
    test: { title: t('Testul CES'), drop: t('Fișierul testului CES'), replace: t('Înlocuiește testul CES') },
    barem: { title: t('Baremul CES'), drop: t('Fișierul baremului CES'), replace: t('Înlocuiește baremul CES') },
  },
};

// The test and the barem (the panel Pregătire of the test page): open them,
// upload them, or replace them. A missing file has the drop area of Test nou;
// a file that is there has the button that replaces it. Not while the robot grades with them; while
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
      {locked && <p className="hint">{t('Testul se corectează acum. Poți schimba fișierele după ce se termină corectarea.')}</p>}
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
          kind={'barem'}
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
  const inputId = variant === 'ces' ? `file-ces-${kind}` : `file-${kind}`;

  return (
    <li>
      <p className="file-title">
        <strong>{names.title}:</strong>{' '}
        {file ? (
          <>
            <a href={testFileUrl(code, kind, variant)} target="_blank" rel="noopener">
              {file.name}
            </a>{' '}
            {unchecked ? <span className="tag tag-wait">{t('de verificat')}</span> : <span className="tag tag-ok">{t('gata')}</span>}
          </>
        ) : missing ? (
          <span className="tag tag-wait">{t('lipsește')}</span>
        ) : (
          <span className="hint">{t('lipsește')}</span>
        )}
      </p>
      {file ? (
        <TestFileInput
          key={round}
          id={inputId}
          label={names.replace}
          disabled={locked || upload.isPending}
          actions={actions}
          confirm={
            kind === 'barem' ? (picked) => window.confirm(t('Înlocuiești {v1} existent cu {name}?', { v1: variant === 'ces' ? t('baremul CES') : t('baremul'), name: picked.name })) : undefined
          }
          onPick={(picked) => {
            if (picked) upload.mutate(picked);
          }}
        />
      ) : (
        <>
          <FileDrop
            key={round}
            id={inputId}
            name={names.drop}
            disabled={locked || upload.isPending}
            onPick={(picked) => {
              if (picked) upload.mutate(picked);
            }}
          />
          {actions && <div className="file-field">{actions}</div>}
        </>
      )}
      {upload.isPending && <p role="status">{t('Se încarcă…')}</p>}
      {upload.error && <ErrorMessage error={upload.error} />}
      {status}
      {kind === 'barem' && (
        <BaremNotesEditor code={code} variant={variant} notes={baremNotes ?? ''} locked={locked} onChanged={onChanged} onRobot={onRobot} />
      )}
    </li>
  );
}

// The teacher's notes for the barem ("Indicații suplimentare pentru corectare"), always
// open: the robot reads them as part of the barem, when it grades and when it
// generates the barem, so the teacher need not replace the barem file. Like a
// new barem, saving them clears the exercise list and starts the robot during
// evaluation, so they are saved only with "Salvează", shown once the text
// differs from what is saved, never while typing.
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
  const [text, setText] = useState(notes);
  const [seen, setSeen] = useState(notes);
  const [saved, setSaved] = useState(false);
  // New notes from the server replace the text, unless the teacher changed it.
  if (notes !== seen) {
    setSeen(notes);
    if (text === seen) setText(notes);
  }
  const ces = variant === 'ces';
  const id = ces ? 'ces-barem-notes' : 'barem-notes';
  // The server keeps the notes trimmed, so spaces at the ends are no change.
  const changed = text.trim() !== notes;
  const save = useMutation({
    mutationFn: (value: string) => api.saveBaremNotes(code, value, variant),
    onSuccess: async (answer) => {
      setText(answer.baremNotes);
      setSaved(true);
      onRobot(answer.robot);
      await onChanged();
    },
  });

  return (
    <form
      className="barem-notes"
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        save.mutate(text);
      }}
    >
      <label htmlFor={id}>{ces ? t('Indicații suplimentare pentru corectarea CES') : t('Indicații suplimentare pentru corectare')}</label>
      <p className="hint" id={`${id}-help`}>
        {ces
          ? t('Se adaugă la baremul CES. Robotul le folosește când dă punctele și când generează baremul.')
          : t('Se adaugă la barem. Robotul le folosește când dă punctele, ca să corecteze cum vrei tu.')}
      </p>
      <textarea
        id={id}
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          setSaved(false);
        }}
        maxLength={MAX_BAREM_NOTES_LENGTH}
        rows={3}
        disabled={locked}
        aria-describedby={`${id}-help`}
        placeholder={
          ces
            ? t('De exemplu: acceptă rezultatul fără justificare la exercițiul 1.')
            : t('De exemplu: la exercițiul 2 acceptă și metoda cu proporții. La 3b, fără unitatea de măsură scade 1 punct.')
        }
      />
      <div className="barem-notes-foot">
        {changed ? (
          <span className="row-actions">
            <button className="button button-small" type="submit" disabled={save.isPending || locked}>
              <ActionIcon name="check" />
              {t('Salvează indicațiile')}
            </button>
            <button type="button" className="button-quiet button-small" disabled={save.isPending} onClick={() => setText(notes)}>
              <ActionIcon name="close" />
              {t('Renunță')}
            </button>
          </span>
        ) : (
          saved && (
            <span className="barem-notes-saved" role="status">
              {t('Salvate')}
            </span>
          )
        )}
        <span className="barem-notes-count">
          {text.length} / {MAX_BAREM_NOTES_LENGTH}
        </span>
      </div>
      {save.error && <ErrorMessage error={save.error} />}
    </form>
  );
}
