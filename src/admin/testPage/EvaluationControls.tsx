import { useMutation } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import type { RobotStart, TestInfo, UploadRow } from '../../../shared/api.ts';
import { MAX_SCHEDULE_DAYS } from '../../../shared/tests.ts';
import { bucharestInputToIso, bucharestInputValue } from '../../ui/bucharestTime.ts';
import { formatDateTime } from '../../ui/format.ts';
import { useApi } from '../ApiContext.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';

const DAY_MS = 24 * 60 * 60 * 1000;

// The files the evaluation needs, as steps for the teacher.
function missingFiles(test: TestInfo): string[] {
  const missing: string[] = [];
  if (!test.files.test) missing.push('Încarcă testul.');
  if (!test.files.barem) missing.push('Încarcă baremul.');
  return missing;
}

// Start evaluation while the uploads are open (spec §8.4): now, or at a time
// the teacher picks in Romania's local time. Scheduling needs only the files:
// the students may still upload until then.
export function EvaluationControls({
  test,
  uploads,
  onChanged,
  onRobot,
}: {
  test: TestInfo;
  uploads: UploadRow[];
  onChanged: () => Promise<void>;
  onRobot: (robot: RobotStart | null) => void;
}) {
  const api = useApi();
  const [when, setWhen] = useState('');
  const [badTime, setBadTime] = useState(false);
  const start = useMutation({
    mutationFn: () => api.evaluateTest(test.code),
    onSuccess: async (answer) => {
      onRobot(answer.robot);
      await onChanged();
    },
  });
  const schedule = useMutation({
    mutationFn: (at: string) => api.evaluateTest(test.code, at),
    onSuccess: async () => {
      setWhen('');
      await onChanged();
    },
  });
  const cancel = useMutation({ mutationFn: () => api.cancelSchedule(test.code), onSuccess: onChanged });

  const fileSteps = missingFiles(test);
  const startSteps = uploads.some((row) => row.fileCount > 0) ? fileSteps : [...fileSteps, 'Niciun elev nu a încărcat încă fișiere.'];
  const now = Date.now();

  const submitSchedule = (event: FormEvent) => {
    event.preventDefault();
    const at = bucharestInputToIso(when);
    setBadTime(at === null);
    if (at !== null) schedule.mutate(at);
  };

  return (
    <>
      <p className="hint">După ce pornește evaluarea, elevii nu mai pot încărca. Lucrările începute care au fișiere se trimit așa cum sunt.</p>
      <p>
        <button
          type="button"
          className="button"
          disabled={startSteps.length > 0 || start.isPending}
          onClick={() => {
            if (window.confirm('Pornești evaluarea acum? Elevii nu mai pot încărca după asta.')) start.mutate();
          }}
        >
          Pornește evaluarea acum
        </button>
      </p>
      {startSteps.length > 0 && <p className="hint">Ca să pornești evaluarea: {startSteps.join(' ')}</p>}
      {start.error && <ErrorMessage error={start.error} />}

      {test.evaluationAt ? (
        <p>
          Evaluarea pornește automat la {formatDateTime(test.evaluationAt)}.{' '}
          <button type="button" className="button-quiet button-small" disabled={cancel.isPending} onClick={() => cancel.mutate()}>
            Anulează programarea
          </button>
        </p>
      ) : (
        <form className="form-row" onSubmit={submitSchedule}>
          <label htmlFor="evaluation-at">Sau pornește evaluarea automat la</label>
          <input
            id="evaluation-at"
            type="datetime-local"
            value={when}
            min={bucharestInputValue(new Date(now).toISOString())}
            max={bucharestInputValue(new Date(now + MAX_SCHEDULE_DAYS * DAY_MS).toISOString())}
            onChange={(event) => setWhen(event.target.value)}
            disabled={fileSteps.length > 0}
            required
          />
          <button className="button-quiet button-small" type="submit" disabled={fileSteps.length > 0 || schedule.isPending}>
            Programează
          </button>
        </form>
      )}
      {badTime && (
        <p className="alert" role="alert">
          Alege data și ora.
        </p>
      )}
      {schedule.error && <ErrorMessage error={schedule.error} />}
      {cancel.error && <ErrorMessage error={cancel.error} />}
    </>
  );
}
