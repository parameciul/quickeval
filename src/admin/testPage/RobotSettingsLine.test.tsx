import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RobotSettingsLine, robotSettingsLines } from './RobotSettingsLine.tsx';

const NONE = { gradingModel: null, gradingEffort: null, analysisModel: null, analysisEffort: null };

describe('RobotSettingsLine', () => {
  it('shows nothing when nothing was graded', () => {
    const { container } = render(<RobotSettingsLine robot={NONE} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the grading and the analysis lines', () => {
    render(<RobotSettingsLine robot={{ gradingModel: 'claude-opus-5', gradingEffort: 'high', analysisModel: 'claude-opus-5', analysisEffort: 'xhigh' }} />);
    expect(screen.getByText('Model: claude-opus-5, efort: high (corectare)')).toBeInTheDocument();
    expect(screen.getByText('Model: claude-opus-5, efort: xhigh (analiza clasei)')).toBeInTheDocument();
  });

  it('shows only the model when the effort is unknown', () => {
    expect(robotSettingsLines({ ...NONE, gradingModel: 'm' })).toEqual(['Model: m (corectare)']);
  });

  it('shows the analysis line alone', () => {
    expect(robotSettingsLines({ ...NONE, analysisModel: 'a', analysisEffort: 'low' })).toEqual(['Model: a, efort: low (analiza clasei)']);
  });
});
