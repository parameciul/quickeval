import { useEffect, useState, type ReactNode } from 'react';
import { formatDateTime } from '../../ui/format.ts';

const LATE_MINUTES = 30;
// An open page shows the same data while the robot is silent, so the line
// moves on by itself this often, and the warning shows without a reload.
const TICK_MS = 30_000;

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

// `children` show only while grading may be late.
export function RobotLine({ lastCheckAt, children }: { lastCheckAt: string | null; children?: ReactNode }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((tick) => tick + 1), TICK_MS);
    return () => clearInterval(timer);
  }, []);
  const { text, late } = robotLine(lastCheckAt, Date.now());
  if (!late) return <p className="hint">{text}</p>;
  return (
    <div className="warning">
      <p>{text}</p>
      <p>Corectarea poate întârzia.</p>
      {children}
    </div>
  );
}
