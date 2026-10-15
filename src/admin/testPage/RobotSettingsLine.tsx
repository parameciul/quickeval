import type { RobotSettings } from '../../../shared/api.ts';

function line(model: string | null, effort: string | null, what: string): string | null {
  if (!model) return null;
  return effort ? `Model: ${model}, efort: ${effort} (${what})` : `Model: ${model} (${what})`;
}

// The lines of the model and effort the robot used (teacher pages only).
export function robotSettingsLines(robot: RobotSettings): string[] {
  return [
    line(robot.gradingModel, robot.gradingEffort, 'corectare'),
    line(robot.analysisModel, robot.analysisEffort, 'analiza clasei'),
  ].filter((text): text is string => text !== null);
}

export function RobotSettingsLine({ robot }: { robot: RobotSettings }) {
  const lines = robotSettingsLines(robot);
  if (lines.length === 0) return null;
  return (
    <div className="hint">
      {lines.map((text) => (
        <p key={text}>{text}</p>
      ))}
    </div>
  );
}
