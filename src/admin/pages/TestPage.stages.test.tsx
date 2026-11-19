import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api.ts';
import { PDF_TYPE } from '../../../shared/files.ts';
import type { UploadRow } from '../../../shared/api.ts';
import { createFakeApi, fakePoint, fakeTest, fakeUpload } from '../../test/fakeApi.ts';
import { expectLocation, LocationProbe, renderAdmin } from '../../test/renderAdmin.tsx';
import { uploads, apiWith, PAGE, openStage, NavigationProbe, GoToTest } from './testPageTestKit.tsx';

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('TestPage stages', () => {
  const flagged = [
    fakeUpload({ studentId: 10, studentName: 'Pop Ion', submissionId: 5, status: 'graded', fileCount: 2, grade: 9, flagCount: 2 }),
    fakeUpload({ studentId: 11, studentName: 'Stan Eva', submissionId: 6, status: 'graded', fileCount: 1, grade: 8 }),
  ];

  function doneApi() {
    return createFakeApi({
      classes: [{ id: 1, name: '6E2', schoolYear: 2026, archived: false, studentCount: 2 }],
      students: {},
      tests: [fakeTest({ status: 'done', startedAt: '2026-10-06T07:15:00.000Z', evaluationStartedAt: '2026-10-07T08:00:00.000Z' }, structuredClone(flagged))],
    });
  }

  it('lists the six stages with their state, and opens the current one', async () => {
    renderAdmin(PAGE, doneApi());
    const stages = await screen.findByRole('navigation', { name: 'Etapele testului' });
    const links = within(stages).getAllByRole('link');
    expect(links.map((link) => link.textContent)).toEqual([
      'Pregătire gata',
      'Tipărire gata',
      'În clasă gata',
      'Corectare gata',
      'Verificare te așteaptă: 2 puncte nesigure',
      'Rezultate urmează',
    ]);
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/tests/6E2-26T1#prepare',
      '/tests/6E2-26T1#print',
      '/tests/6E2-26T1#in-class',
      '/tests/6E2-26T1#grading',
      '/tests/6E2-26T1#review',
      '/tests/6E2-26T1#results',
    ]);
    expect(links.map((link) => link.closest('li')!.className)).toEqual(['is-done', 'is-done', 'is-done', 'is-done', 'is-wait', 'is-later']);
    expect(links[4]).toHaveAttribute('aria-current', 'step');
    expect(links.filter((link) => link.hasAttribute('aria-current'))).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 2, name: 'Verificare' })).toBeInTheDocument();
    expect(screen.getByText('Punctele nesigure te așteaptă pe tine. Accepți sau schimbi punctajul.')).toBeInTheDocument();
  });

  it('opens the stage a link names, keeps it in the address, and moves on with the next-stage link', async () => {
    renderAdmin(
      PAGE,
      doneApi(),
      <>
        <LocationProbe />
        <NavigationProbe />
      </>,
    );
    await openStage('Pregătire');
    await expectLocation('/tests/6E2-26T1#prepare');
    // The stage replaces the address: Back leaves the test page.
    expect(screen.getByTestId('navigation')).toHaveTextContent('REPLACE');
    const stages = screen.getByRole('navigation', { name: 'Etapele testului' });
    expect(within(stages).getByRole('link', { name: /^Pregătire / })).toHaveAttribute('aria-current', 'step');
    expect(within(stages).getByRole('link', { name: /^Verificare / })).not.toHaveAttribute('aria-current');
    expect(screen.queryByRole('heading', { level: 2, name: 'Verificare' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('link', { name: 'Mergi la Tipărire' }));
    // The new panel's heading takes the focus, so the page shows its top.
    expect(await screen.findByRole('heading', { level: 2, name: 'Tipărire' })).toHaveFocus();
    await expectLocation('/tests/6E2-26T1#print');
    // A click on the list of stages keeps the focus on its link.
    const corectare = within(stages).getByRole('link', { name: /^Corectare / });
    await userEvent.click(corectare);
    expect(await screen.findByRole('heading', { level: 2, name: 'Corectare' })).not.toHaveFocus();
    expect(corectare).toHaveFocus();
  });

  it('moves the focus to a new panel only when the next-stage link opened it', async () => {
    renderAdmin(`${PAGE}#prepare`, doneApi());
    const user = userEvent.setup();
    // A click with Ctrl opens the link in a new tab: this page stays as it is.
    // jsdom has no tabs, so the test stops that part of the click.
    const noNewTab = (event: MouseEvent) => {
      if (event.ctrlKey) event.preventDefault();
    };
    window.addEventListener('click', noNewTab, true);
    await user.keyboard('{Control>}');
    await user.click(await screen.findByRole('link', { name: 'Mergi la Tipărire' }));
    await user.keyboard('{/Control}');
    window.removeEventListener('click', noNewTab, true);
    expect(screen.getByRole('heading', { level: 2, name: 'Pregătire' })).toBeInTheDocument();
    const corectare = within(screen.getByRole('navigation', { name: 'Etapele testului' })).getByRole('link', { name: /^Corectare / });
    await user.click(corectare);
    expect(await screen.findByRole('heading', { level: 2, name: 'Corectare' })).not.toHaveFocus();
    expect(corectare).toHaveFocus();
  });

  it('opens the stage the test is at now, not the one that data kept from an earlier visit shows', async () => {
    const api = createFakeApi({
      classes: [{ id: 1, name: '6E2', schoolYear: 2026, archived: false, studentCount: 2 }],
      students: {},
      tests: [
        fakeTest(
          { status: 'evaluating', startedAt: '2026-10-06T07:15:00.000Z', evaluationStartedAt: '2026-10-07T08:00:00.000Z' },
          flagged.map((row) => ({ ...row, flagCount: 0 })),
        ),
      ],
    });
    renderAdmin(PAGE, api, <GoToTest />);
    expect(await screen.findByRole('heading', { level: 2, name: 'Corectare' })).toBeInTheDocument();
    await userEvent.click(within(screen.getByRole('navigation', { name: 'Unde ești' })).getByRole('link', { name: 'Teste' }));
    await waitFor(() => expect(screen.queryByRole('navigation', { name: 'Etapele testului' })).not.toBeInTheDocument());
    // Meanwhile the grading ended, and points wait to be checked.
    api.getTest = doneApi().getTest;
    await userEvent.click(screen.getByRole('button', { name: 'Mergi la test' }));
    expect(await screen.findByRole('heading', { level: 2, name: 'Verificare' })).toBeInTheDocument();
  });

  it('opens the stage the address names, and the current stage for an unknown address', async () => {
    const { unmount } = renderAdmin(`${PAGE}#in-class`, doneApi());
    expect(await screen.findByRole('heading', { level: 2, name: 'În clasă' })).toBeInTheDocument();
    unmount();
    renderAdmin(`${PAGE}#nimic`, doneApi());
    expect(await screen.findByRole('heading', { level: 2, name: 'Verificare' })).toBeInTheDocument();
  });

  it('keeps the panel open when a button moves the test to another stage', async () => {
    const api = createFakeApi({
      classes: [{ id: 1, name: '6E2', schoolYear: 2026, archived: false, studentCount: 0 }],
      students: {},
      tests: [
        fakeTest({
          files: { test: { name: 'Test.pdf', type: PDF_TYPE }, barem: { name: 'Barem.docx', type: PDF_TYPE } },
          barem: { request: 'none', unchecked: true },
          print: { status: 'ready', fromWord: false },
        }),
      ],
    });
    renderAdmin(PAGE, api);
    const stages = await screen.findByRole('navigation', { name: 'Etapele testului' });
    expect(within(stages).getByRole('link', { name: 'Pregătire te așteaptă: baremul de verificat' })).toHaveAttribute('aria-current', 'step');
    await userEvent.click(screen.getByRole('button', { name: 'Am verificat baremul' }));
    // The test is ready for the class now, and its current stage is În clasă.
    expect(await within(stages).findByRole('link', { name: 'Pregătire gata' })).toHaveAttribute('aria-current', 'step');
    expect(screen.getByRole('heading', { level: 2, name: 'Pregătire' })).toBeInTheDocument();
  });

  it('says in the same "Acum" box what a stage that has not come yet needs, and keeps its frame', async () => {
    renderAdmin(`${PAGE}#grading`, apiWith());
    expect(await screen.findByText('Corectarea pornește după ce elevii trimit lucrările')).toHaveClass('now-title');
    expect(screen.getByText('Acum · corectarea nu a început')).toBeInTheDocument();
    const needs = () => screen.getByRole('list', { name: 'Ce așteaptă etapa' });
    expect(within(needs()).getAllByRole('listitem').map((item) => item.querySelector('strong')?.textContent)).toEqual([
      'Testul',
      'Baremul',
      'Testul început',
      'Lucrări trimise',
    ]);
    // What waits on the teacher is orange, with a link to the stage that does it.
    const barem = within(needs()).getByText('Baremul').closest('li')!;
    expect(barem).toHaveClass('is-wait');
    expect(within(barem).getByText('lipsește')).toBeInTheDocument();
    expect(within(barem).getByRole('link', { name: 'Mergi la Pregătire: Baremul' })).toHaveAttribute('href', '/tests/6E2-26T1#prepare');
    // The papers table keeps its place, with every student.
    expect(screen.getByRole('table', { name: 'Încărcările elevilor' })).toBeInTheDocument();
    expect(screen.getByText('Urmează').closest('p')).toHaveTextContent('Urmează Verifici punctele nesigure la etapa Verificare.');

    await openStage('Verificare');
    expect(screen.getByText('Verificarea începe după corectare')).toHaveClass('now-title');
    expect(within(needs()).getByText('Testul început')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'De verificat' })).toBeInTheDocument();
    expect(screen.getByText(/^Aici apar elevii cu puncte nesigure/)).toHaveClass('stage-slot');

    await openStage('Rezultate');
    expect(screen.getByText('Rezultatele se publică după corectare')).toHaveClass('now-title');
    expect(screen.getByRole('table', { name: 'Linkurile cu rezultatele elevilor' })).toBeInTheDocument();
  });
});

describe('TestPage Verificare', () => {
  function reviewApi(rows: UploadRow[]) {
    return createFakeApi({
      classes: [{ id: 1, name: '6E2', schoolYear: 2026, archived: false, studentCount: 3 }],
      students: {},
      tests: [fakeTest({ status: 'done', startedAt: '2026-10-06T07:15:00.000Z' }, rows)],
    });
  }

  // Marin Dan has the pages and one item to check, Pop Ion one item; Stan Eva
  // was graded with no point. The rows come in name order, as from the API.
  const rows = ({ marin = 0, pop = 0 } = {}) => [
    fakeUpload({
      studentId: 12,
      studentName: 'Marin Dan',
      submissionId: 7,
      status: 'graded',
      fileCount: 1,
      grade: 6.5,
      flagCount: 2 - marin,
      checkedCount: marin,
      reviewPoints: [
        { kind: 'pages' as const, pages: ['student/page-02.jpg'] },
        fakePoint(41, { label: 'Subiectul II, 1)', points: 3, maxPoints: 5, reason: 'Răspunsul e tăiat.' }),
      ].slice(marin),
    }),
    fakeUpload({
      studentId: 10,
      studentName: 'Pop Ion',
      submissionId: 5,
      status: 'graded',
      fileCount: 2,
      grade: 8.75,
      flagCount: 1 - pop,
      checkedCount: pop,
      reviewPoints: [fakePoint(31, { label: 'Subiectul I, 3)', points: 0.5, maxPoints: 2, reason: 'Cifra se citește greu.' })].slice(pop),
    }),
    fakeUpload({ studentId: 11, studentName: 'Stan Eva', submissionId: 6, status: 'graded', fileCount: 1, grade: 8 }),
  ];

  it('starts the check: the progress in the "Acum" box, the main button, and a label per student left', async () => {
    renderAdmin(`${PAGE}#review`, reviewApi(rows()));
    const panel = await screen.findByRole('region', { name: 'Verificare' });
    expect(within(panel).getByText('Acum · te așteaptă')).toBeInTheDocument();
    expect(within(panel).getByText('3 puncte de verificat, la 2 elevi')).toHaveClass('now-title');
    expect(within(panel).getByRole('progressbar', { name: 'Puncte verificate' })).toHaveAttribute('aria-valuenow', '0');
    expect(within(panel).getByRole('progressbar', { name: 'Puncte verificate' })).toHaveAttribute('aria-valuemax', '3');
    expect(within(panel).getByText('0 din 3 puncte verificate.')).toBeInTheDocument();
    const start = within(panel).getByRole('link', { name: 'Începe verificarea' });
    expect(start).toHaveAttribute('href', '/tests/6E2-26T1/review');
    // The one main action of the stage, blue like on every other stage.
    expect(start).toHaveClass('button');
    expect(start).not.toHaveClass('button-wait');
    expect(within(panel).getByText('2 elevi · clic pe un nume')).toBeInTheDocument();
    const left = within(within(within(panel).getByRole('region', { name: 'De verificat' })).getByRole('list')).getAllByRole('link');
    expect(left.map((link) => link.getAttribute('href'))).toEqual([
      '/tests/6E2-26T1/review?paper=7&item=pages',
      '/tests/6E2-26T1/review?paper=5&item=31',
    ]);
    expect(left.map((link) => link.textContent)).toEqual(['Marin Dan 0/2', 'Pop Ion 0/1']);
    expect(left[0]).toHaveAccessibleName('Marin Dan: 0 din 2 verificate');
    // No papers table here, and no student without a point.
    expect(within(panel).queryByText('Stan Eva')).not.toBeInTheDocument();
    expect(within(panel).queryByRole('table')).not.toBeInTheDocument();
    expect(within(panel).queryByRole('heading', { name: 'Gata' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Mergi la Rezultate' })).toBeInTheDocument();
  });

  it('continues the check, with the students done under Gata', async () => {
    renderAdmin(`${PAGE}#review`, reviewApi(rows({ marin: 1, pop: 1 })));
    const panel = await screen.findByRole('region', { name: 'Verificare' });
    expect(within(panel).getByRole('link', { name: 'Continuă verificarea' })).toHaveAttribute('href', '/tests/6E2-26T1/review');
    expect(within(panel).queryByRole('link', { name: 'Începe verificarea' })).not.toBeInTheDocument();
    expect(within(panel).getByRole('progressbar', { name: 'Puncte verificate' })).toHaveAttribute('aria-valuenow', '2');
    expect(within(panel).getByText('1 punct de verificat, la 1 elev')).toBeInTheDocument();
    expect(within(panel).getByText('2 din 3 puncte verificate.')).toBeInTheDocument();
    const left = within(within(within(panel).getByRole('region', { name: 'De verificat' })).getByRole('list')).getAllByRole('link');
    expect(left.map((link) => [link.textContent, link.getAttribute('href')])).toEqual([['Marin Dan 1/2', '/tests/6E2-26T1/review?paper=7&item=41']]);
    expect(within(panel).getByText('1 elev · clic pe un nume')).toBeInTheDocument();
    const done = within(within(within(panel).getByRole('region', { name: 'Gata' })).getByRole('list')).getAllByRole('link');
    expect(done.map((link) => [link.textContent, link.getAttribute('href')])).toEqual([['✓ Pop Ion', '/tests/6E2-26T1/papers/5']]);
  });

  it('says when every point is checked and leads to Rezultate', async () => {
    renderAdmin(`${PAGE}#review`, reviewApi(rows({ marin: 2, pop: 1 })));
    const panel = await screen.findByRole('region', { name: 'Verificare' });
    expect(within(panel).getByText('Toate cele 3 puncte sunt verificate')).toHaveClass('now-title', 'is-done');
    // The box has no button of its own: "Urmează" and the bar at the foot lead to Rezultate.
    expect(within(panel).getByRole('link', { name: 'Rezultate' })).toHaveAttribute('href', '/tests/6E2-26T1#results');
    expect(within(panel).queryByRole('link', { name: 'Mergi la Rezultate' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Mergi la Rezultate' })).toHaveAttribute('href', '/tests/6E2-26T1#results');
    expect(within(panel).queryByRole('link', { name: /verificarea$/ })).not.toBeInTheDocument();
    expect(within(panel).queryByRole('progressbar')).not.toBeInTheDocument();
    expect(within(panel).queryByRole('region', { name: 'De verificat' })).not.toBeInTheDocument();
    const done = within(within(within(panel).getByRole('region', { name: 'Gata' })).getByRole('list')).getAllByRole('link');
    expect(done.map((link) => link.textContent)).toEqual(['✓ Marin Dan', '✓ Pop Ion']);
    // It opens Rezultate as the stage links do: its heading takes the focus.
    await userEvent.click(screen.getByRole('link', { name: 'Mergi la Rezultate' }));
    expect(await screen.findByRole('heading', { level: 2, name: 'Rezultate' })).toHaveFocus();
  });

  it('names the one point when a test had only one to check', async () => {
    renderAdmin(`${PAGE}#review`, reviewApi(rows({ pop: 1 }).slice(1)));
    const panel = await screen.findByRole('region', { name: 'Verificare' });
    expect(within(panel).getByText('Singurul punct de verificat e verificat')).toHaveClass('now-title', 'is-done');
  });

  it('says there is nothing to check when no paper had a point', async () => {
    renderAdmin(`${PAGE}#review`, reviewApi(rows().slice(2)));
    const panel = await screen.findByRole('region', { name: 'Verificare' });
    expect(within(panel).getByText('Nimic de verificat')).toHaveClass('now-title', 'is-done');
    expect(within(panel).getByText('Lucrările corectate nu au puncte nesigure.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Mergi la Rezultate' })).toHaveAttribute('href', '/tests/6E2-26T1#results');
    expect(within(panel).queryByRole('list')).not.toBeInTheDocument();
    expect(within(panel).queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('marks a paper graded with the CES variant, also for a screen reader', async () => {
    const [marin, pop] = rows({ pop: 1 });
    // The student is no longer marked CES; the paper was graded on the CES variant.
    marin!.variant = 'ces';
    pop!.ces = true;
    renderAdmin(`${PAGE}#review`, reviewApi([marin!, pop!]));
    const panel = await screen.findByRole('region', { name: 'Verificare' });
    const left = within(within(within(panel).getByRole('region', { name: 'De verificat' })).getByRole('list')).getByRole('link');
    expect(left).toHaveTextContent('Marin DanCES 0/2');
    expect(left).toHaveAccessibleName('Marin Dan, CES: 0 din 2 verificate');
    const done = within(within(within(panel).getByRole('region', { name: 'Gata' })).getByRole('list')).getByRole('link');
    expect(done).toHaveTextContent('✓ Pop IonCES');
  });

  it('lists a paper whose points are not in the cached row yet, opening its first point', async () => {
    const [marin] = rows();
    marin!.reviewPoints = [];
    renderAdmin(`${PAGE}#review`, reviewApi([marin!]));
    const panel = await screen.findByRole('region', { name: 'Verificare' });
    const left = within(within(within(panel).getByRole('region', { name: 'De verificat' })).getByRole('list')).getByRole('link');
    expect(left).toHaveAttribute('href', '/tests/6E2-26T1/review?paper=7');
    expect(within(panel).getByText('2 puncte de verificat, la 1 elev')).toBeInTheDocument();
  });

  it('waits for the grading before it lists anything', async () => {
    renderAdmin(`${PAGE}#review`, apiWith({ status: 'evaluating' }));
    expect(await screen.findByText('Verificarea începe după corectare')).toBeInTheDocument();
    const needs = within(screen.getByRole('list', { name: 'Ce așteaptă etapa' }));
    expect(needs.getByText('Corectarea').closest('li')).toHaveTextContent('Corectarea în lucru: se corectează lucrărileMergi la Corectare');
    expect(needs.getByText('Corectarea').closest('li')).toHaveClass('is-now');
    // "De verificat" keeps its place, with a sentence and no list yet.
    expect(within(screen.getByRole('region', { name: 'De verificat' })).queryByRole('list')).not.toBeInTheDocument();
    expect(screen.queryByText('Nimic de verificat')).not.toBeInTheDocument();
  });
});

describe('TestPage and a test started by mistake', () => {
  const noFiles = [fakeUpload({ studentId: 10, studentName: 'Pop Ion', submissionId: 5, status: 'uploading', fileCount: 0 }), fakeUpload({ studentId: 12, studentName: 'Marin Dan' })];

  function openApi(rows: UploadRow[]) {
    return createFakeApi({
      classes: [{ id: 1, name: '6E2', schoolYear: 2026, archived: false, studentCount: 2 }],
      students: {},
      tests: [fakeTest({ status: 'open', startedAt: '2026-10-05T17:30:00.000Z' }, structuredClone(rows))],
    });
  }

  it('stops an open test while no student has uploaded a file, after a confirmation', async () => {
    const api = openApi(noFiles);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderAdmin(`${PAGE}#in-class`, api);
    expect(await screen.findByText(/început 5 oct\. 2026, 20:30/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Oprește testul' }));
    expect(confirm).toHaveBeenCalledWith(
      'Oprești testul? Elevii nu mai pot încărca lucrările până îl începi din nou, iar data testului se șterge.',
    );
    expect(api.stopTest).toHaveBeenCalledWith('6E2-26T1');
    expect(await screen.findByRole('button', { name: 'Începe testul' })).toBeInTheDocument();
    expect(screen.getByText('Ciornă')).toBeInTheDocument();
    expect(screen.queryByText(/început 5 oct/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Oprește testul' })).not.toBeInTheDocument();
  });

  it('keeps the test open when the teacher says no', async () => {
    const api = openApi(noFiles);
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderAdmin(`${PAGE}#in-class`, api);
    await userEvent.click(await screen.findByRole('button', { name: 'Oprește testul' }));
    expect(api.stopTest).not.toHaveBeenCalled();
  });

  it('says in the confirmation that a scheduled evaluation is cancelled too', async () => {
    const api = createFakeApi({
      classes: [{ id: 1, name: '6E2', schoolYear: 2026, archived: false, studentCount: 2 }],
      students: {},
      tests: [fakeTest({ status: 'open', evaluationAt: '2026-10-06T09:00:00.000Z' }, structuredClone(noFiles))],
    });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderAdmin(`${PAGE}#in-class`, api);
    await userEvent.click(await screen.findByRole('button', { name: 'Oprește testul' }));
    expect(confirm).toHaveBeenCalledWith(
      'Oprești testul? Elevii nu mai pot încărca lucrările până îl începi din nou, iar data testului se șterge. Corectarea programată se anulează.',
    );
  });

  it('offers no stop on a test reopened after an evaluation', async () => {
    const api = createFakeApi({
      classes: [{ id: 1, name: '6E2', schoolYear: 2026, archived: false, studentCount: 2 }],
      students: {},
      tests: [fakeTest({ status: 'open', evaluationStartedAt: '2026-10-06T09:00:00.000Z' }, structuredClone(noFiles))],
    });
    renderAdmin(`${PAGE}#in-class`, api);
    expect(await screen.findByText('Încărcarea e deschisă.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Oprește testul' })).not.toBeInTheDocument();
  });

  it('offers no stop once a student has uploaded a file', async () => {
    renderAdmin(`${PAGE}#in-class`, openApi(uploads));
    expect(await screen.findByText('Încărcarea e deschisă.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Oprește testul' })).not.toBeInTheDocument();
  });

  it('says why the API refused the stop', async () => {
    const api = openApi(noFiles);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    api.stopTest.mockRejectedValueOnce(
      new ApiError(409, 'has_uploads', 'Un elev a încărcat deja lucrarea, așa că testul nu mai poate fi oprit.'),
    );
    renderAdmin(`${PAGE}#in-class`, api);
    await userEvent.click(await screen.findByRole('button', { name: 'Oprește testul' }));
    expect(await screen.findByText('Un elev a încărcat deja lucrarea, așa că testul nu mai poate fi oprit.')).toBeInTheDocument();
  });
});
