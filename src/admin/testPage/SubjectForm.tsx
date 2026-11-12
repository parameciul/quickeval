import { useMutation } from '@tanstack/react-query';
import { useId, useState, type FormEvent } from 'react';
import type { RobotStart, TestInfo } from '../../../shared/api.ts';
import { SUBJECT_NAMES, SUBJECTS, type Subject } from '../../../shared/subjects.ts';
import { useApi } from '../ApiContext.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';

// The subject in a few words, for Fișa testului.
export function subjectLine(test: Pick<TestInfo, 'subject'>): string {
  const { subject } = test;
  if (subject === null) return 'Se stabilește la corectare';
  if (subject.value === 'alta') return `${subject.name || 'altă materie'} (nu o corectăm)`;
  return SUBJECT_NAMES[subject.value];
}

// A new subject after the exercise list exists makes the list again and
// grades the graded papers again (the API does it; spec: any subject). A
// reopened test grades them at its next start.
function remakes(test: TestInfo): boolean {
  const listMade = test.exerciseList.status !== 'none' || test.ces.exerciseList.status !== 'none';
  return (test.status === 'open' || test.status === 'evaluating' || test.status === 'done') && listMade;
}

// "Schimbă" (spec: any subject, "The teacher can fix it"): the teacher picks
// one of the subjects the robot grades. It opens in place of its button.
export function SubjectForm({
  test,
  onDone,
  onRobot,
  onClose,
}: {
  test: TestInfo;
  onDone: () => Promise<void>;
  onRobot: (robot: RobotStart | null) => void;
  onClose: () => void;
}) {
  const api = useApi();
  const id = useId();
  const current = test.subject !== null && test.subject.value !== 'alta' ? test.subject.value : null;
  const [chosen, setChosen] = useState<Subject | null>(current);
  const save = useMutation({
    mutationFn: (subject: Subject) => api.setSubject(test.code, subject),
    onSuccess: async (answer) => {
      if (answer.robot !== null) onRobot(answer.robot);
      onClose();
      await onDone();
    },
  });
  const changes = chosen !== null && chosen !== (test.subject?.value ?? 'matematica');

  return (
    <form
      className="rename-form subject-form"
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        if (chosen !== null) save.mutate(chosen);
      }}
    >
      <fieldset className="subject-choices">
        <legend>Materia testului</legend>
        {SUBJECTS.map((subject) => (
          <label key={subject} htmlFor={`${id}-${subject}`}>
            <input
              id={`${id}-${subject}`}
              type="radio"
              name={`${id}-subject`}
              value={subject}
              checked={chosen === subject}
              onChange={() => setChosen(subject)}
            />
            {SUBJECT_NAMES[subject]}
          </label>
        ))}
      </fieldset>
      {changes && remakes(test) && <p className="hint">Lista de exerciții se face din nou, iar lucrările corectate se corectează din nou.</p>}
      <span className="row-actions">
        <button className="button button-small" type="submit" disabled={chosen === null || save.isPending}>
          Salvează
        </button>
        <button type="button" className="button-quiet button-small" onClick={onClose}>
          Renunță
        </button>
      </span>
      {save.error && <ErrorMessage error={save.error} />}
    </form>
  );
}

// The robot reads the test now (in evaluation, its list not waiting for the
// teacher): the API refuses a change of subject (spec: any subject).
function robotReads(test: TestInfo): boolean {
  return test.status === 'evaluating' && test.exerciseList.status !== 'problem' && test.exerciseList.status !== 'failed';
}

// The subject with its button: "Alege materia" before the robot found it,
// "Schimbă materia" after. The form opens in place of the button. While the
// robot reads the test, a line says when the subject can change.
export function SubjectChange({
  test,
  onChanged,
  onRobot,
}: {
  test: TestInfo;
  onChanged: () => Promise<void>;
  onRobot: (robot: RobotStart | null) => void;
}) {
  const [open, setOpen] = useState(false);
  if (robotReads(test)) return <p className="hint">Poți schimba materia după ce se termină corectarea.</p>;
  if (open) return <SubjectForm test={test} onDone={onChanged} onRobot={onRobot} onClose={() => setOpen(false)} />;
  return (
    <button type="button" className="button-quiet button-small" onClick={() => setOpen(true)}>
      {test.subject === null ? 'Alege materia' : 'Schimbă materia'}
    </button>
  );
}
