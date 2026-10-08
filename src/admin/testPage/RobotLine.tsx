import { formatDateTime } from '../../ui/format.ts';

const LATE_MINUTES = 30;

// When the robot last looked for work (spec §9). The robot checks every 10
// minutes, but GitHub can run the check late or stop it: after 30 minutes
// without a check, grading may be late.
export function robotLine(lastCheckAt: string | null, now: number): { text: string; late: boolean } {
  if (lastCheckAt === null) return { text: 'Robotul nu a verificat încă dacă are lucrări de corectat.', late: true };
  const minutes = Math.floor((now - Date.parse(lastCheckAt)) / 60_000);
  const text =
    minutes < 1
      ? 'Robotul a verificat acum mai puțin de un minut.'
      : minutes < 60
        ? `Robotul a verificat acum ${minutes} min.`
        : `Robotul a verificat ultima dată la ${formatDateTime(lastCheckAt)}.`;
  return { text, late: minutes >= LATE_MINUTES };
}

export function RobotLine({ lastCheckAt }: { lastCheckAt: string | null }) {
  const { text, late } = robotLine(lastCheckAt, Date.now());
  if (!late) return <p className="hint">{text}</p>;
  return (
    <div className="warning">
      <p>{text}</p>
      <p>Corectarea poate întârzia.</p>
    </div>
  );
}
