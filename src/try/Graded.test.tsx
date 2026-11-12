import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { StudentResultView } from '../../shared/api.ts';
import { PDF_TYPE } from '../../shared/files.ts';
import { QUICK_TRY_STUDENT, QUICK_TRY_TITLE } from '../../shared/quickTry.ts';
import type { AnswerArea } from '../../shared/schemas.ts';
import { formatPoints } from '../../shared/scoring.ts';
import { createFakeApi, fakeEvaluation, fakeItem, fakeSubmission, reviewPointsOf } from '../test/fakeApi.ts';
import { createFakeTryApi, renderTry, TRY_CODE, TRY_SUBMISSION, TRY_TOKEN, tryTest } from '../test/fakeTryApi.tsx';
import { expectNoGradingWords } from '../test/gradingWords.ts';
import { LocationProbe } from '../test/renderAdmin.tsx';

const files = { test: { name: 'test.pdf', type: PDF_TYPE }, barem: { name: 'barem.pdf', type: PDF_TYPE } };
const photo = { id: 61, name: 'p1.jpg', contentType: 'image/jpeg', size: 1000, position: 1 };

const studentResult: StudentResultView = {
  testCode: TRY_CODE,
  testTitle: QUICK_TRY_TITLE,
  className: 'PROBA',
  studentName: QUICK_TRY_STUDENT,
  submittedAt: '2026-11-03T08:15:00.000Z',
  status: 'graded',
  files: [photo],
  evaluation: {
    maxTotal: 10,
    officePoints: 1,
    total: 7,
    grade: 7,
    summary: 'Ai lucrat bine.',
    strengths: [],
    recommendations: [],
    items: [{ exerciseId: 'I.1', label: 'Subiectul I, ex. 1', maxPoints: 4.5, points: 3, studentAnswer: '3/4', comment: 'Aproape.' }],
  },
};

// A graded try: I.1 waits for a check unless `checked`; `areas` say where its answer is.
function setup(path = '/', checked = false, unreadable: string[] = [], areas: AnswerArea[] = []) {
  const evaluation = fakeEvaluation(
    [fakeItem({ id: 71, exerciseId: 'I.1', label: 'Subiectul I, ex. 1', points: 3, needsReview: !checked, reviewReason: 'Scrisul se citește greu.', page: 1, areas })],
    { unreadable },
  );
  const paper = fakeSubmission({ id: TRY_SUBMISSION, testCode: TRY_CODE, testTitle: QUICK_TRY_TITLE, studentName: QUICK_TRY_STUDENT, files: [photo], evaluation });
  const test = tryTest(
    { status: 'done', files },
    {
      status: 'graded',
      fileCount: 1,
      grade: evaluation.grade,
      total: evaluation.total,
      maxTotal: 10,
      flagCount: evaluation.flagCount,
      reviewPoints: reviewPointsOf(evaluation),
    },
  );
  const api = createFakeApi({ classes: [], students: {}, tests: [test], submissions: [paper] });
  const tryApi = createFakeTryApi({ result: structuredClone(studentResult) });
  renderTry(path, api, tryApi, <LocationProbe />);
  return { api, tryApi };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('a graded try', () => {
  it('opens on the points to check, and the review of the app checks them', async () => {
    const { api } = setup();
    expect(await screen.findByRole('tab', { name: 'Verificare' })).toHaveAttribute('aria-selected', 'true');
    await userEvent.click(screen.getByRole('link', { name: 'Verifică 1 punct' }));
    expect(await screen.findByRole('heading', { name: 'Verificare', level: 1 })).toBeInTheDocument();
    expect(await screen.findByRole('img', { name: /Pagina 1/ })).toHaveAttribute('src', `/api/try/${TRY_TOKEN}/submissions/${TRY_SUBMISSION}/files/61`);
    await userEvent.click(await screen.findByRole('button', { name: 'Confirmă 3p' }));
    await waitFor(() => expect(api.correctItem).toHaveBeenCalledWith(TRY_SUBMISSION, 71, expect.objectContaining({ reviewed: true })));
    await userEvent.click(screen.getByRole('link', { name: 'Înapoi la test' }));
    expect(await screen.findByRole('heading', { name: 'Încercare rapidă', level: 1 })).toBeInTheDocument();
  });

  it("opens the review on the whole page, with the border the teacher's review draws", async () => {
    setup('/', false, [], [{ page: 1, x0: 0.1, y0: 0.3, x1: 0.7, y1: 0.5 }]);
    await userEvent.click(await screen.findByRole('link', { name: 'Verifică 1 punct' }));
    const frame = await screen.findByTestId('answer-frame');
    expect(within(frame).getByText('I.1')).toBeInTheDocument();
    // No automatic zoom: the page stays whole until the teacher zooms it herself.
    expect(screen.queryByRole('button', { name: 'Toată pagina' })).not.toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Arată chenarul' })).toBeChecked();
  });

  it('shows the paper page in the review, without the students, the path or the actions of a class paper', async () => {
    setup();
    await userEvent.click(await screen.findByRole('link', { name: 'Verifică 1 punct' }));
    expect(await screen.findByRole('region', { name: 'Decizia' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Doar de verificat (1)' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('navigation', { name: 'Elevii' })).not.toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Unde ești' })).not.toBeInTheDocument();
    for (const name of ['Alte acțiuni', 'Elevul anterior', 'Elevul următor']) {
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
    }
    expect(screen.queryByRole('link', { name: 'Toate notele elevului' })).not.toBeInTheDocument();
    expect(screen.queryByText('Linkul cu rezultatul elevului')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Toate exercițiile' }));
    expect(screen.getByTestId('location')).toHaveTextContent(`/teste/PROBA-26T1/verificare?lucrare=${TRY_SUBMISSION}&punct=71&vedere=toate`);
    expect(await screen.findByRole('heading', { name: 'Ce a lucrat bine' })).toBeInTheDocument();
  });

  it('shows the grade and the points to check above the views', async () => {
    const { api } = setup();
    const paper = (await api.getTest(TRY_CODE)).uploads[0]!;
    const summary = await screen.findByRole('region', { name: 'Rezultatul încercării' });
    expect(within(summary).getByText('Nota')).toBeInTheDocument();
    expect(within(summary).getByText(formatPoints(paper.grade!))).toBeInTheDocument();
    expect(within(summary).getByText(`${formatPoints(paper.total!)} din 10 puncte`)).toBeInTheDocument();
    expect(within(summary).getByText('1 punct nesigur')).toBeInTheDocument();
    expect(within(summary).getByRole('link', { name: 'Verifică 1 punct' })).toHaveAttribute('href', '/teste/PROBA-26T1/verificare');
  });

  it('lists each point to check with its reason, and opens the review at it', async () => {
    setup();
    const panel = await screen.findByRole('tabpanel');
    expect(within(panel).getByText('Subiectul I, ex. 1')).toBeInTheDocument();
    expect(within(panel).getByText('Scrisul se citește greu.')).toBeInTheDocument();
    await userEvent.click(within(panel).getByRole('link', { name: 'Verifică Subiectul I, ex. 1' }));
    expect(await screen.findByRole('heading', { name: 'Verificare', level: 1 })).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent(`/teste/PROBA-26T1/verificare?lucrare=${TRY_SUBMISSION}&punct=71`);
  });

  it('gives the result tabs a short name for a phone, and keeps their full name', async () => {
    setup();
    const tab = await screen.findByRole('tab', { name: 'Rezultatul profesorului' });
    expect(within(tab).getByText('Profesor')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByRole('tab', { name: 'Rezultatul elevului' })).toHaveTextContent('Elev');
  });

  it('names the pages the robot could not read as the review does', async () => {
    setup('/', true, ['student/page-02.jpg', 'student/page-03.jpg']);
    const panel = await screen.findByRole('tabpanel');
    expect(within(panel).getByText('Pagini greu de citit')).toBeInTheDocument();
    expect(within(panel).getByText('Robotul nu a putut citi: Pagina 2, Pagina 3.')).toBeInTheDocument();
    expect(panel).not.toHaveTextContent('page-02');
    expect(within(panel).getByRole('link', { name: 'Verifică Pagini greu de citit' })).toHaveAttribute(
      'href',
      `/teste/PROBA-26T1/verificare?lucrare=${TRY_SUBMISSION}&punct=pagini`,
    );
  });

  it('counts the points to check on the Verificare tab', async () => {
    setup();
    const tab = await screen.findByRole('tab', { name: 'Verificare' });
    expect(tab).toHaveTextContent('Verificare1');
    expect(tab).toHaveAccessibleDescription('1 punct de verificat');
  });

  it("says when nothing is left to check", async () => {
    setup('/', true);
    expect(await screen.findByText('Toate punctele sunt verificate.')).toBeInTheDocument();
    expect(screen.getByText('Nu mai ai puncte de verificat. Rezultatul profesorului și cel al elevului sunt gata.')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Verifică/ })).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Verificare' })).toHaveTextContent(/^Verificare$/);
  });

  it("shows the teacher's result with its pages first, hidden until asked for", async () => {
    const { api } = setup();
    await userEvent.click(await screen.findByRole('tab', { name: 'Rezultatul profesorului' }));
    const exercise = await screen.findByText('Subiectul I, ex. 1');
    const strip = screen.getByRole('heading', { name: /^Fișiere \(\d+\)$/ });
    expect(strip.compareDocumentPosition(exercise) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByRole('img', { name: 'Pagina 1' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Arată fișierele' }));
    expect(screen.getByRole('img', { name: 'Pagina 1' })).toHaveAttribute('src', `/api/try/${TRY_TOKEN}/submissions/${TRY_SUBMISSION}/files/61`);
    expect(api.getSubmission).toHaveBeenCalledWith(TRY_SUBMISSION);
  });

  it("opens the teacher's result from the review's link to the results", async () => {
    setup('/teste/PROBA-26T1#rezultate');
    expect(await screen.findByRole('tab', { name: 'Rezultatul profesorului' })).toHaveAttribute('aria-selected', 'true');
  });

  it("opens the teacher's result from the review's link to the paper", async () => {
    setup(`/teste/PROBA-26T1/elevi/${TRY_SUBMISSION}`);
    expect(await screen.findByRole('tab', { name: 'Rezultatul profesorului' })).toHaveAttribute('aria-selected', 'true');
  });

  it('shows the page the student would see, with no word on how it was graded', async () => {
    const { tryApi } = setup();
    await userEvent.click(await screen.findByRole('tab', { name: 'Rezultatul elevului' }));
    const view = await screen.findByTestId('student-view');
    expect(within(view).getByRole('heading', { name: QUICK_TRY_STUDENT })).toBeInTheDocument();
    expect(tryApi.result).toHaveBeenCalled();
    expectNoGradingWords(view.textContent ?? '');
    const strip = within(view).getByRole('heading', { name: /^Fișiere \(\d+\)$/ });
    const grade = within(view).getByRole('heading', { name: 'Rezultatul tău' });
    expect(strip.compareDocumentPosition(grade) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await userEvent.click(within(view).getByRole('button', { name: 'Arată fișierele' }));
    expect(within(view).getByRole('img', { name: 'Pagina 1' })).toHaveAttribute('src', `/api/try/${TRY_TOKEN}/paper/61`);
  });

  it('moves between the views with the arrow keys', async () => {
    setup();
    const first = await screen.findByRole('tab', { name: 'Verificare' });
    first.focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Rezultatul profesorului' })).toHaveAttribute('aria-selected', 'true');
  });

  it('invites her to a free class test with an account', async () => {
    setup();
    const invite = await screen.findByRole('link', { name: 'Creează un cont: corectezi gratuit un test pentru toată clasa.' });
    expect(invite).toHaveAttribute('href', '/teacher/#cont-nou');
    expect(screen.getByText(/Îți place\?/)).toBeInTheDocument();
  });
});

describe('Distribuie', () => {
  it("copies the try's link when the browser has no share sheet", async () => {
    setup();
    const writeText = vi.fn(async () => undefined);
    vi.stubGlobal('navigator', { ...navigator, share: undefined, clipboard: { writeText } });
    await userEvent.click(await screen.findByRole('button', { name: 'Distribuie' }));
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/try/${TRY_TOKEN}`);
    expect(await screen.findByText('Linkul a fost copiat.')).toBeInTheDocument();
  });

  it("uses the browser's share sheet where there is one", async () => {
    setup();
    const share = vi.fn(async () => undefined);
    vi.stubGlobal('navigator', { ...navigator, share });
    await userEvent.click(await screen.findByRole('button', { name: 'Distribuie' }));
    expect(share).toHaveBeenCalledWith({ title: 'MQGrader · Încercare rapidă', url: `${window.location.origin}/try/${TRY_TOKEN}` });
  });
});
