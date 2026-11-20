import '../test/english.ts';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { StudentResultView } from '../../shared/api.ts';
import { UPLOAD } from '../i18n/en/upload.ts';
import { createFakeUploadApi, LINK_TOKEN } from '../test/fakeUploadApi.ts';
import { expectNoGradingWords } from '../test/gradingWords.ts';
import { ResultApp } from './ResultApp.tsx';
import { UploadApp } from './UploadApp.tsx';

// Romanian left on an English page: its letters, or one of its common words.
const ROMANIAN = /[ăâîșțĂÂÎȘȚ]|\b(și|sau|din|pentru|lucrar\w*|elev\w*|testul|nota|puncte|punctaj\w*|trimis\w*|Pagina|Subiectul)\b/;

const graded: StudentResultView = {
  resultCode: 'K7M92P',
  testCode: '6E2-26T1',
  testTitle: 'Fractions',
  className: '6E2',
  studentName: 'BAKER NOAH',
  submittedAt: '2026-11-03T08:15:00.000Z',
  status: 'graded',
  files: [{ id: 21, name: 'IMG_0001.jpg', contentType: 'image/jpeg', size: 820 * 1024, position: 1 }],
  evaluation: {
    maxTotal: 10,
    officePoints: 1,
    total: 6.5,
    grade: 6.5,
    summary: 'Good work on fractions.',
    strengths: ['Equivalent fractions'],
    recommendations: ['Practise equations.'],
    items: [{ exerciseId: 'I.1', label: 'Part I, ex. 1', maxPoints: 4.5, points: 4.5, studentAnswer: '3/4', comment: 'Right.' }],
  },
};

describe('the student pages in English', () => {
  it('show the class list, the English site links and the button back to Romanian', async () => {
    render(<UploadApp api={createFakeUploadApi()} token={LINK_TOKEN} />);
    expect(await screen.findByRole('heading', { name: 'Pick your name' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Stan Eva, has sent' })).toBeDisabled();
    const banner = screen.getByRole('banner');
    expect(within(banner).getAllByRole('link').map((link) => link.getAttribute('href'))).toEqual(['https://mqgrader.ro/en/', 'https://mqgrader.ro/en/about/']);
    expect(within(banner).getByRole('link', { name: 'About' })).toBeInTheDocument();
    expect(within(banner).getByRole('button', { name: 'Română' })).toHaveTextContent('RO');
    expect(within(banner).getByRole('button', { name: 'Dark theme' })).toBeInTheDocument();
    expectNoGradingWords();
  });

  it('ask the student to confirm the name in English', async () => {
    render(<UploadApp api={createFakeUploadApi()} token={LINK_TOKEN} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Pop Ion' }));
    expect(screen.getByRole('heading', { name: 'Are you Pop Ion?' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: "Yes, let's start" })).toBeInTheDocument();
    expectNoGradingWords();
  });

  it('show a result in English, with no Romanian and no word on how it was graded', async () => {
    const api = createFakeUploadApi();
    api.getResult.mockResolvedValue(structuredClone(graded));
    render(<ResultApp api={api} resultToken="result-token-11" />);
    expect(await screen.findByRole('heading', { name: 'BAKER NOAH' })).toBeInTheDocument();
    const labels = [...document.body.querySelectorAll('[aria-label], [alt], [title], [placeholder]')].flatMap((element) =>
      ['aria-label', 'alt', 'title', 'placeholder'].map((name) => element.getAttribute(name) ?? ''),
    );
    const text = [document.body.textContent ?? '', ...labels].join('\n').replaceAll('Română', '');
    expect(text.match(new RegExp(ROMANIAN.source, 'g'))).toBeNull();
    expect(text).toContain('6.5');
    expectNoGradingWords();
  });

  it('never say how the work is graded', () => {
    expectNoGradingWords(Object.values(UPLOAD).join('\n'));
  });
});
