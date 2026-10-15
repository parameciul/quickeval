import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { ClassReport, RobotStart } from '../../../shared/api.ts';
import type { ClassAnalysis } from '../../../shared/schemas.ts';
import { robotStartMessage } from '../../ui/format.ts';
import { useApi } from '../ApiContext.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';

const SECTIONS: { key: keyof Omit<ClassAnalysis, 'overview'>; title: string }[] = [
  { key: 'strengths', title: 'Ce a mers bine' },
  { key: 'weaknesses', title: 'Ce a mers mai greu' },
  { key: 'commonMistakes', title: 'Greșeli frecvente' },
  { key: 'recommendations', title: 'Ce exersați în continuare' },
];

// The analysis of the class (spec §14.2): written by the robot after the
// grading. Out of date after corrections; the teacher asks for a new one.
export function AnalysisSection({ code, report }: { code: string; report: ClassReport }) {
  const api = useApi();
  const queryClient = useQueryClient();
  const [robot, setRobot] = useState<RobotStart | null>(null);
  const regenerate = useMutation({
    mutationFn: () => api.regenerateAnalysis(code),
    onSuccess: async (answer) => {
      setRobot(answer.robot);
      await queryClient.invalidateQueries({ queryKey: ['report', code] });
      await queryClient.invalidateQueries({ queryKey: ['test', code] });
      await queryClient.invalidateQueries({ queryKey: ['tests'] });
    },
  });
  if (report.rows.length === 0) return null;
  const { status, stale, content } = report.analysis;

  // The robot analyzes only tests in evaluation (or done): an open test gets
  // its analysis after the next evaluation.
  const canAsk = report.test.status === 'evaluating' || report.test.status === 'done';
  const button = (label: string) =>
    !canAsk ? null : (
    <button type="button" className="button-quiet button-small" disabled={regenerate.isPending} onClick={() => regenerate.mutate()}>
      {label}
    </button>
  );

  return (
    <section aria-label="Analiza clasei">
      <h2>Analiza clasei</h2>
      {status === 'requested' && canAsk && <p role="status">Robotul scrie analiza clasei. Pagina se reînnoiește singură.</p>}
      {status === 'requested' && !canAsk && <p className="hint">Analiza se scrie după ce testul este corectat din nou.</p>}
      {status === 'none' && (
        <>
          <p className="hint">Analiza clasei nu a fost făcută încă.</p>
          {button('Fă analiza clasei')}
        </>
      )}
      {status === 'failed' && (
        <div className="warning">
          <p>
            <strong>Robotul nu a putut scrie analiza clasei.</strong>
          </p>
          {button('Regenerează')}
        </div>
      )}
      {status === 'ready' && content && (
        <>
          {stale && (
            <div className="warning" role="status">
              <p>Analiza poate fi depășită: notele s-au schimbat după ce a fost scrisă.</p>
              {button('Regenerează')}
            </div>
          )}
          <p>{content.overview}</p>
          {SECTIONS.map(({ key, title }) =>
            content[key].length > 0 ? (
              <section key={key} aria-label={title}>
                <h3>{title}</h3>
                <ul>
                  {content[key].map((text, index) => (
                    <li key={index}>{text}</li>
                  ))}
                </ul>
              </section>
            ) : null,
          )}
          {!stale && button('Regenerează')}
        </>
      )}
      {robot && <p role="status">{robotStartMessage(robot)}</p>}
      {regenerate.error && <ErrorMessage error={regenerate.error} />}
    </section>
  );
}
