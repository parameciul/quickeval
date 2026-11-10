import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { StudentResultView } from '../../shared/api.ts';
import { StudentResult } from './StudentResult.tsx';

const result: StudentResultView = {
  testCode: 'PROBA-26T1',
  testTitle: 'Încercare rapidă',
  className: 'PROBA',
  studentName: 'Elev',
  status: 'graded',
  files: [{ id: 21, name: 'IMG_0001.jpg', contentType: 'image/jpeg', size: 1024, position: 1 }],
  evaluation: null,
};

const graded: StudentResultView = {
  ...result,
  evaluation: {
    maxTotal: 10,
    officePoints: 1,
    total: 6.5,
    grade: 6.5,
    summary: 'Ai lucrat bine la fracții.',
    strengths: ['Fracții echivalente'],
    recommendations: ['Exersează ecuațiile.'],
    items: [{ exerciseId: 'I.1', label: 'Subiectul I, ex. 1', maxPoints: 4.5, points: 4.5, studentAnswer: '3/4', comment: 'Corect.' }],
  },
};

describe('StudentResult', () => {
  it('opens the pages at the addresses its page gives', async () => {
    render(<StudentResult result={result} fileUrl={(fileId) => `/api/try/abc/paper/${fileId}`} />);
    await userEvent.click(screen.getByRole('button', { name: 'Arată fișierele' }));
    expect(screen.getByRole('img', { name: 'Pagina 1' })).toHaveAttribute('src', '/api/try/abc/paper/21');
  });

  it('puts the grade first, then the exercises, the final words, and the files last', () => {
    const { container } = render(<StudentResult result={graded} fileUrl={() => '#'} />);
    const order = [...container.querySelectorAll('.result-grade, table.items, section[aria-label="Rezumat"], .files-head')].map(
      (element) => element.getAttribute('aria-label') ?? element.className,
    );
    expect(order).toEqual(['result-grade', 'items', 'Rezumat', 'files-head']);
    const side = container.querySelector('.result-side');
    expect(side).not.toBeNull();
    expect(within(side as HTMLElement).getByRole('heading', { name: 'Rezumat' })).toBeInTheDocument();
    expect(within(side as HTMLElement).getByRole('heading', { name: 'Recomandări' })).toBeInTheDocument();
    expect(container.querySelector('.result-main table.items')).not.toBeNull();
  });

  it('has no grade card and no side column when the result is not graded', () => {
    const { container } = render(<StudentResult result={result} fileUrl={() => '#'} />);
    expect(container.querySelector('.result-grade')).toBeNull();
    expect(container.querySelector('.result-side')).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent('Rezultatul tău nu este gata încă');
  });
});
