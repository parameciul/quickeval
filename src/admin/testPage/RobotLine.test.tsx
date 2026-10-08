import { describe, expect, it } from 'vitest';
import { robotLine } from './RobotLine.tsx';

const NOW = Date.parse('2026-10-08T07:00:00.000Z');
const ago = (minutes: number) => new Date(NOW - minutes * 60_000).toISOString();

describe('robotLine', () => {
  it('warns while the robot never checked', () => {
    expect(robotLine(null, NOW)).toEqual({ text: 'Robotul nu a verificat încă dacă are lucrări de corectat.', late: true });
  });

  it('says how long ago the robot checked', () => {
    expect(robotLine(ago(0.5), NOW)).toEqual({ text: 'Robotul a verificat acum mai puțin de un minut.', late: false });
    expect(robotLine(ago(3), NOW)).toEqual({ text: 'Robotul a verificat acum 3 min.', late: false });
    expect(robotLine(ago(29.9), NOW).late).toBe(false);
  });

  it('warns after 30 minutes without a check', () => {
    expect(robotLine(ago(30), NOW)).toEqual({ text: 'Robotul a verificat acum 30 min.', late: true });
    expect(robotLine(ago(120), NOW)).toEqual({ text: 'Robotul a verificat ultima dată la 8 oct. 2026, 08:00.', late: true });
  });
});
