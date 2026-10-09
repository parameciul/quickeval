import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RobotLine, robotLine } from './RobotLine.tsx';

const NOW = Date.parse('2026-10-08T07:00:00.000Z');
const ago = (minutes: number) => new Date(NOW - minutes * 60_000).toISOString();

afterEach(() => {
  vi.useRealTimers();
});

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

describe('RobotLine', () => {
  it('moves on by itself on an open page, and warns once 30 minutes pass without a check', () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
    vi.setSystemTime(NOW);
    render(<RobotLine lastCheckAt={ago(29)} />);
    expect(screen.getByText('Robotul a verificat acum 29 min.')).toBeInTheDocument();
    expect(screen.queryByText('Corectarea poate întârzia.')).not.toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(screen.getByText('Robotul a verificat acum 30 min.')).toBeInTheDocument();
    expect(screen.getByText('Corectarea poate întârzia.')).toBeInTheDocument();
  });

  it('shows its button only while grading may be late', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    const { rerender } = render(
      <RobotLine lastCheckAt={ago(5)}>
        <button type="button">Pornește robotul</button>
      </RobotLine>,
    );
    expect(screen.queryByRole('button', { name: 'Pornește robotul' })).not.toBeInTheDocument();
    rerender(
      <RobotLine lastCheckAt={ago(45)}>
        <button type="button">Pornește robotul</button>
      </RobotLine>,
    );
    expect(screen.getByRole('button', { name: 'Pornește robotul' })).toBeInTheDocument();
  });
});
