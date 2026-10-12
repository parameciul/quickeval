import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { StudentResultView } from '../../shared/api.ts';
import { ApiError } from '../ui/ApiError.ts';
import { createFakeUploadApi } from '../test/fakeUploadApi.ts';
import { expectNoGradingWords } from '../test/gradingWords.ts';
import { ResultApp } from './ResultApp.tsx';

const graded: StudentResultView = {
  testCode: '6E2-26T1',
  testTitle: 'Fracții',
  className: '6E2',
  studentName: 'Pop Ion',
  status: 'graded',
  files: [
    { id: 21, name: 'IMG_0001.jpg', contentType: 'image/jpeg', size: 820 * 1024, position: 1 },
    { id: 22, name: 'scan.pdf', contentType: 'application/pdf', size: 1500, position: 2 },
  ],
  evaluation: {
    maxTotal: 10,
    officePoints: 1,
    total: 6.5,
    grade: 6.5,
    summary: 'Ai lucrat bine la fracții.',
    strengths: ['Fracții echivalente'],
    recommendations: ['Exersează ecuațiile.'],
    items: [
      { exerciseId: 'I.1', label: 'Subiectul I, ex. 1', maxPoints: 4.5, points: 4.5, studentAnswer: '3/4', comment: 'Corect.' },
      { exerciseId: 'II.1', label: 'Subiectul II, ex. 1', maxPoints: 4.5, points: 1, studentAnswer: 'x = 3', comment: 'Verifică semnul.' },
    ],
  },
};

describe('ResultApp', () => {
  it('shows the grade, the mistakes, and the final words, without any teacher controls', async () => {
    const api = createFakeUploadApi();
    api.getResult.mockResolvedValue(structuredClone(graded));
    render(<ResultApp api={api} resultToken="result-token-11" />);
    expect(await screen.findByRole('heading', { name: 'Pop Ion' })).toBeInTheDocument();
    expect(screen.getByText(/Nota/)).toHaveTextContent('Nota 6,5 · 6,5 puncte din 10, cu 1 din oficiu');
    expect(screen.getByText('4,5 din 4,5')).toBeInTheDocument();
    expect(screen.getByText('x = 3')).toBeInTheDocument();
    expect(screen.getByText('Verifică semnul.')).toBeInTheDocument();
    expect(screen.getByText('Ai lucrat bine la fracții.')).toBeInTheDocument();
    expect(screen.getByText('Fracții echivalente')).toBeInTheDocument();
    expect(screen.getByText('Exersează ecuațiile.')).toBeInTheDocument();
    // No confidence column, no modify or check controls.
    expect(screen.queryByText(/Siguranța/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Modifică/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Verificat/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/De verificat/)).not.toBeInTheDocument();
    expectNoGradingWords();
  });

  it('shows only the files button, and the files after it', async () => {
    const api = createFakeUploadApi();
    api.getResult.mockResolvedValue(structuredClone(graded));
    render(<ResultApp api={api} resultToken="result-token-11" />);
    await screen.findByRole('heading', { name: 'Pop Ion' });
    const buttons = screen.getAllByRole('button');
    expect(buttons.map((button) => button.textContent)).toEqual(['Arată fișierele']);
    await userEvent.click(screen.getByRole('button', { name: 'Arată fișierele' }));
    expect(await screen.findByRole('img', { name: 'Pagina 1' })).toHaveAttribute('src', '/api/u/rezultat/result-token-11/files/21');
    expect(screen.getByTitle('Pagina 2')).toHaveAttribute('src', '/api/u/rezultat/result-token-11/files/22');
    await userEvent.click(screen.getByRole('button', { name: 'Ascunde fișierele' }));
    expect(screen.queryByRole('img', { name: 'Pagina 1' })).not.toBeInTheDocument();
    expectNoGradingWords();
  });

  it('says the result is not ready yet when the upload is not graded', async () => {
    const api = createFakeUploadApi();
    api.getResult.mockResolvedValue({ ...structuredClone(graded), status: 'submitted', evaluation: null });
    render(<ResultApp api={api} resultToken="result-token-11" />);
    expect(await screen.findByRole('status')).toHaveTextContent('Rezultatul tău nu este gata încă. Revino mai târziu pe acest link.');
    expectNoGradingWords();
  });

  it('shows the server message when the results are closed', async () => {
    const api = createFakeUploadApi();
    api.getResult.mockRejectedValueOnce(new ApiError(403, 'results_closed', 'Rezultatele nu sunt disponibile încă. Întreabă profesorul.'));
    render(<ResultApp api={api} resultToken="result-token-11" />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Rezultatele nu sunt disponibile încă. Întreabă profesorul.');
    expectNoGradingWords();
  });

  it('shows a wrong-link message for an address without a valid token', async () => {
    const api = createFakeUploadApi();
    render(<ResultApp api={api} resultToken={null} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Link greșit. Cere profesorului linkul nou.');
    expect(api.getResult).not.toHaveBeenCalled();
    expectNoGradingWords();
  });

  it('hides empty final sections', async () => {
    const api = createFakeUploadApi();
    api.getResult.mockResolvedValue({ ...structuredClone(graded), evaluation: { ...graded.evaluation!, strengths: [], recommendations: [] } });
    render(<ResultApp api={api} resultToken="result-token-11" />);
    await screen.findByRole('heading', { name: 'Pop Ion' });
    expect(screen.queryByRole('heading', { name: 'Ce ai lucrat bine' })).not.toBeInTheDocument();
    const row = screen.getByRole('row', { name: /Subiectul I,/ });
    expect(within(row).getByText('4,5 din 4,5')).toBeInTheDocument();
    expectNoGradingWords();
  });
});
