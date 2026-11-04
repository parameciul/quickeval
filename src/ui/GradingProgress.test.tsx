import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { GradingProgress } from './GradingProgress.tsx';

const widths = (container: HTMLElement) =>
  ['graded', 'waiting'].map((part) => container.querySelector<HTMLElement>(`.grading-progress-${part}`)?.style.width);

describe('GradingProgress', () => {
  it('fills the bar with the graded and the waiting papers, out of the students of the class', () => {
    const { container } = render(<GradingProgress studentCount={20} submittedCount={10} gradedCount={5} />);
    expect(widths(container)).toEqual(['25%', '25%']);
    expect(container.querySelector('.grading-progress-bar')).toHaveAttribute('aria-hidden', 'true');
  });

  it('says the grading is complete when every sent paper is graded', () => {
    const { getByText, container } = render(<GradingProgress studentCount={23} submittedCount={20} gradedCount={20} />);
    expect(getByText('✓ Corectat complet')).toBeInTheDocument();
    expect(container.querySelector('.grading-progress-complete')).not.toBeNull();
    expect(widths(container)[1]).toBe('0%');
  });

  it('does not say complete while a sent paper waits, or when nothing is graded', () => {
    const waiting = render(<GradingProgress studentCount={23} submittedCount={20} gradedCount={19} />);
    expect(waiting.queryByText('✓ Corectat complet')).not.toBeInTheDocument();
    const none = render(<GradingProgress studentCount={23} submittedCount={5} gradedCount={0} />);
    expect(none.queryByText('✓ Corectat complet')).not.toBeInTheDocument();
  });

  it('keeps the bar inside its width when more papers than students were sent', () => {
    const { container } = render(<GradingProgress studentCount={2} submittedCount={3} gradedCount={3} />);
    expect(widths(container)).toEqual(['100%', '0%']);
  });

  it('shows nothing for a class with no students and no papers', () => {
    const { container } = render(<GradingProgress studentCount={0} submittedCount={0} gradedCount={0} />);
    expect(container).toBeEmptyDOMElement();
  });
});
