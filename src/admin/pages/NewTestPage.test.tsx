import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { DOCX_TYPE, PDF_TYPE } from '../../../shared/files.ts';
import { ApiError } from '../api.ts';
import { createFakeApi } from '../../test/fakeApi.ts';
import { expectLocation, LocationProbe, renderAdmin } from '../../test/renderAdmin.tsx';

const classes = () =>
  createFakeApi({
    classes: [
      { id: 1, name: '6E2', schoolYear: 2026, archived: false, studentCount: 0 },
      { id: 2, name: '7E2', schoolYear: 2026, archived: false, studentCount: 0 },
      { id: 3, name: '9R2', schoolYear: 2026, archived: true, studentCount: 0 },
    ],
    students: { 1: [{ id: 10, fullName: 'Pop Ion', active: true, canDelete: true, ces: false }] },
  });

const pdf = (name: string) => new File(['%PDF-1.7'], name, { type: PDF_TYPE });
const testField = () => screen.getByLabelText(/^Fișierul testului/);
const baremField = () => screen.getByLabelText(/^Fișierul baremului/);
const choice = (name: RegExp) => screen.getByRole('radio', { name });

// The class and the title, the first step.
async function fillClassAndTitle(classId = '1') {
  await userEvent.selectOptions(await screen.findByLabelText('Clasa'), classId);
  await userEvent.type(screen.getByLabelText('Titlul testului'), 'Fracții');
}

describe('NewTestPage', () => {
  it('shows the three steps and what comes after', async () => {
    renderAdmin('/teste/nou', classes());
    const first = (await screen.findByRole('heading', { level: 2, name: 'Clasa și titlul' })).closest('li')!;
    expect(first.parentElement).toHaveClass('steps');
    expect(first.parentElement!.firstElementChild).toBe(first);
    expect(screen.getByRole('heading', { level: 2, name: 'Testul' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Baremul' })).toBeInTheDocument();
    const next = screen.getByRole('region', { name: 'După ce creezi testul' });
    expect(next).toHaveTextContent('Linkul elevilor e gata imediat');
    expect(next).toHaveTextContent('Tipărești testul cu cod QR');
    expect(next).toHaveTextContent('În ziua testului: Începe testul');
    expect(screen.getByText('Testul rămâne ciornă până apeși „Începe testul”.')).toBeInTheDocument();
  });

  it('offers the classes that are not archived', async () => {
    renderAdmin('/teste/nou', classes());
    const select = await screen.findByLabelText('Clasa');
    const options = [...(select as HTMLSelectElement).options].map((option) => option.textContent);
    expect(options).toEqual(['Alege clasa', 'Clasa 6E2', 'Clasa 7E2']);
  });

  it('creates the test, uploads both files, and opens the test', async () => {
    const api = classes();
    renderAdmin('/teste/nou', api, <LocationProbe />);
    await fillClassAndTitle();
    const test = pdf('Test.pdf');
    const barem = new File(['PK'], 'Barem.docx', { type: DOCX_TYPE });
    await userEvent.upload(testField(), test);
    expect(choice(/^Încarc baremul acum/)).toBeChecked();
    await userEvent.upload(baremField(), barem);
    await userEvent.click(screen.getByRole('button', { name: 'Creează testul' }));

    await expectLocation('/teste/6E2-26T1');
    expect(api.createTest).toHaveBeenCalledWith({ classId: 1, title: 'Fracții' });
    expect(api.uploadTestFile).toHaveBeenCalledWith('6E2-26T1', 'test', test);
    expect(api.uploadTestFile).toHaveBeenCalledWith('6E2-26T1', 'barem', barem);
    expect(api.generateBarem).not.toHaveBeenCalled();
  });

  it('takes a test file dragged onto its area', async () => {
    const api = classes();
    const { container } = renderAdmin('/teste/nou', api, <LocationProbe />);
    await fillClassAndTitle();
    const test = pdf('Test.pdf');
    fireEvent.drop(container.querySelector('label[for="new-test-file"]')!, { dataTransfer: { files: [test] } });
    await userEvent.click(screen.getByRole('button', { name: 'Creează testul' }));
    await expectLocation('/teste/6E2-26T1');
    expect(api.uploadTestFile).toHaveBeenCalledWith('6E2-26T1', 'test', test);
  });

  it('generates the barem from the test, after the test is sent', async () => {
    const api = classes();
    renderAdmin('/teste/nou', api, <LocationProbe />);
    await fillClassAndTitle();
    await userEvent.upload(testField(), pdf('Test.pdf'));
    await userEvent.click(choice(/^Generează baremul din test/));
    expect(baremField().closest('.choice-drop')).not.toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Creează testul' }));

    await expectLocation('/teste/6E2-26T1');
    expect(api.generateBarem).toHaveBeenCalledWith('6E2-26T1');
    expect(api.uploadTestFile.mock.invocationCallOrder[0]).toBeLessThan(api.generateBarem.mock.invocationCallOrder[0]!);
    expect(api.uploadTestFile).toHaveBeenCalledTimes(1);
  });

  it('cannot generate the barem without the test, and says why', async () => {
    renderAdmin('/teste/nou', classes());
    await screen.findByLabelText('Clasa');
    const generate = choice(/^Generează baremul din test/);
    expect(generate).toBeDisabled();
    expect(generate.closest('label')).toHaveTextContent('Alege întâi testul, la pasul 2.');
    await userEvent.upload(testField(), pdf('Test.pdf'));
    expect(generate).toBeEnabled();
    expect(generate.closest('label')).not.toHaveTextContent('Alege întâi testul');
  });

  it('moves to Mai târziu when the test file it would generate from is refused', async () => {
    const api = classes();
    renderAdmin('/teste/nou', api, <LocationProbe />);
    const user = userEvent.setup({ applyAccept: false });
    await user.selectOptions(await screen.findByLabelText('Clasa'), '1');
    await user.type(screen.getByLabelText('Titlul testului'), 'Fracții');
    await user.upload(testField(), pdf('Test.pdf'));
    await user.click(choice(/^Generează baremul din test/));
    await user.upload(testField(), new File(['x'], 'notes.txt', { type: 'text/plain' }));
    expect(choice(/^Mai târziu/)).toBeChecked();
    expect(choice(/^Generează baremul din test/)).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Creează testul' }));
    await expectLocation('/teste/6E2-26T1');
    expect(api.uploadTestFile).not.toHaveBeenCalled();
    expect(api.generateBarem).not.toHaveBeenCalled();
  });

  it('does not send a picked barem when another choice is made, and keeps it for its own', async () => {
    const api = classes();
    renderAdmin('/teste/nou', api, <LocationProbe />);
    await fillClassAndTitle();
    await userEvent.upload(baremField(), pdf('Barem.pdf'));
    await userEvent.click(choice(/^Mai târziu/));
    await userEvent.click(choice(/^Încarc baremul acum/));
    expect(baremField().closest('.file-drop-field')).toHaveTextContent('Barem.pdf');
    await userEvent.click(choice(/^Mai târziu/));
    await userEvent.click(screen.getByRole('button', { name: 'Creează testul' }));
    await expectLocation('/teste/6E2-26T1');
    expect(api.uploadTestFile).not.toHaveBeenCalled();
  });

  it('creates the test alone when no file is chosen', async () => {
    const api = classes();
    renderAdmin('/teste/nou', api, <LocationProbe />);
    await fillClassAndTitle();
    await userEvent.click(screen.getByRole('button', { name: 'Creează testul' }));
    await expectLocation('/teste/6E2-26T1');
    expect(api.uploadTestFile).not.toHaveBeenCalled();
    expect(api.generateBarem).not.toHaveBeenCalled();
  });

  it('picks the class named in the link, without Clasă nouă', async () => {
    renderAdmin('/teste/nou?clasa=2', classes());
    expect(await screen.findByLabelText('Clasa')).toHaveValue('2');
    expect(screen.queryByRole('button', { name: 'Clasă nouă' })).not.toBeInTheDocument();
  });

  it('makes a new class in place and chooses it', async () => {
    const api = classes();
    renderAdmin('/teste/nou', api, <LocationProbe />);
    await userEvent.click(await screen.findByRole('button', { name: 'Clasă nouă' }));
    const dialog = screen.getByRole('dialog', { name: 'Clasă nouă' });
    await userEvent.type(within(dialog).getByLabelText('Numele clasei'), '8A');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Adaugă clasa' }));

    await expectLocation('/teste/nou');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    const select = screen.getByLabelText('Clasa') as HTMLSelectElement;
    expect(select.selectedOptions[0]).toHaveTextContent('Clasa 8A');
    expect(screen.getByRole('button', { name: 'Clasă nouă' })).toHaveFocus();
    expect(api.createClass).toHaveBeenCalledWith({ name: '8A', schoolYear: 2026 });
  });

  it('refuses a file that is not PDF or Word before sending anything', async () => {
    const api = classes();
    renderAdmin('/teste/nou', api, <LocationProbe />);
    const user = userEvent.setup({ applyAccept: false });
    await user.selectOptions(await screen.findByLabelText('Clasa'), '1');
    await user.type(screen.getByLabelText('Titlul testului'), 'Fracții');
    await user.upload(testField(), new File(['x'], 'notes.txt', { type: 'text/plain' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Încarcă un fișier PDF sau Word (.docx).');
    await user.click(screen.getByRole('button', { name: 'Creează testul' }));
    await expectLocation('/teste/6E2-26T1');
    expect(api.uploadTestFile).not.toHaveBeenCalled();
  });

  it('opens the new test with a notice when a file fails to upload', async () => {
    const api = classes();
    api.uploadTestFile.mockRejectedValueOnce(new ApiError(413, 'file_too_big', 'Fișierul are peste 25 MB.'));
    renderAdmin('/teste/nou', api, <LocationProbe />);
    await fillClassAndTitle();
    await userEvent.upload(testField(), pdf('Test.pdf'));
    await userEvent.click(screen.getByRole('button', { name: 'Creează testul' }));
    await expectLocation('/teste/6E2-26T1 | Testul a fost creat, dar fișierul Test.pdf nu s-a încărcat: Fișierul are peste 25 MB.');
  });

  it('does not ask for a generated barem when the test failed to upload', async () => {
    const api = classes();
    api.uploadTestFile.mockRejectedValueOnce(new ApiError(413, 'file_too_big', 'Fișierul are peste 25 MB.'));
    renderAdmin('/teste/nou', api, <LocationProbe />);
    await fillClassAndTitle();
    await userEvent.upload(testField(), pdf('Test.pdf'));
    await userEvent.click(choice(/^Generează baremul din test/));
    await userEvent.click(screen.getByRole('button', { name: 'Creează testul' }));
    await expectLocation('/teste/6E2-26T1 | Testul a fost creat, dar fișierul Test.pdf nu s-a încărcat: Fișierul are peste 25 MB.');
    expect(api.generateBarem).not.toHaveBeenCalled();
  });

  it('opens the new test with a notice when the barem cannot be generated', async () => {
    const api = classes();
    api.generateBarem.mockRejectedValueOnce(new ApiError(409, 'not_editable', 'Baremul se poate genera doar înainte de evaluare.'));
    renderAdmin('/teste/nou', api, <LocationProbe />);
    await fillClassAndTitle();
    await userEvent.upload(testField(), pdf('Test.pdf'));
    await userEvent.click(choice(/^Generează baremul din test/));
    await userEvent.click(screen.getByRole('button', { name: 'Creează testul' }));
    await expectLocation(
      '/teste/6E2-26T1 | Testul a fost creat, dar baremul nu s-a putut genera: Baremul se poate genera doar înainte de evaluare.',
    );
  });

  it('shows the server message when the test cannot be made', async () => {
    const api = classes();
    api.createTest.mockRejectedValueOnce(new ApiError(409, 'class_archived', 'Clasa este arhivată.'));
    renderAdmin('/teste/nou', api);
    await fillClassAndTitle('2');
    await userEvent.click(screen.getByRole('button', { name: 'Creează testul' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Clasa este arhivată.');
  });

  it('asks for a class first when the year has none', async () => {
    renderAdmin('/teste/nou', createFakeApi());
    expect(await screen.findByRole('link', { name: 'Adaugă întâi o clasă.' })).toHaveAttribute('href', '/clase');
  });
});

describe('NewTestPage, a class with a CES student', () => {
  const withCes = () =>
    createFakeApi({
      classes: [
        { id: 1, name: '6E2', schoolYear: 2026, archived: false, studentCount: 1 },
        { id: 2, name: '9R2', schoolYear: 2026, archived: false, studentCount: 2 },
      ],
      students: {
        1: [{ id: 10, fullName: 'Pop Ion', active: true, canDelete: true, ces: false }],
        2: [
          { id: 20, fullName: 'Bursașiu Teodor', active: true, canDelete: true, ces: true },
          { id: 21, fullName: 'Ene Ana', active: true, canDelete: true, ces: false },
        ],
      },
    });
  const missingItems = () => [...document.querySelectorAll('.missing-list li')].map((item) => item.textContent);
  const cesBaremChoices = () => within(screen.getByRole('group', { name: 'Baremul CES' }));

  it('shows the CES students and the switch, on, with the CES files beside the class ones', async () => {
    renderAdmin('/teste/nou', withCes());
    await fillClassAndTitle('2');
    const toggle = await screen.findByRole('switch', { name: 'Test separat pentru elevii cu CES' });
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText('Clasa are 1 elev cu CES')).toBeInTheDocument();
    expect(screen.getByText('Bursașiu Teodor')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: /^Testul CES/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: /^Baremul CES/ })).toBeInTheDocument();
    expect(screen.getByLabelText(/^Fișierul testului CES/)).toBeInTheDocument();
  });

  it('shows no switch for a class without a CES student', async () => {
    renderAdmin('/teste/nou', withCes());
    await fillClassAndTitle('1');
    expect(await screen.findByText('Încă lipsesc:')).toBeInTheDocument();
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    expect(missingItems()).toEqual(['testul', 'baremul']);
  });

  it('lists under the button what the test would still miss, and updates it', async () => {
    renderAdmin('/teste/nou', withCes());
    await fillClassAndTitle('2');
    await screen.findByRole('switch');
    expect(screen.getByText('Încă lipsesc:')).toBeInTheDocument();
    expect(missingItems()).toEqual(['testul', 'baremul', 'testul CES', 'baremul CES']);
    expect(screen.getByText('Poți crea testul acum și le adaugi mai târziu.')).toBeInTheDocument();
    await userEvent.upload(screen.getByLabelText(/^Fișierul testului CES/), pdf('Test adaptat.pdf'));
    await userEvent.click(cesBaremChoices().getByRole('radio', { name: /^Generează baremul CES/ }));
    expect(missingItems()).toEqual(['testul', 'baremul']);
  });

  it('creates the test with the CES test, and asks for the CES barem after the class files', async () => {
    const api = withCes();
    renderAdmin('/teste/nou', api, <LocationProbe />);
    await fillClassAndTitle('2');
    await screen.findByRole('switch');
    const test = pdf('Test.pdf');
    const ces = pdf('Test adaptat.pdf');
    await userEvent.upload(screen.getByLabelText(/^Fișierul testului:/), test);
    await userEvent.upload(screen.getByLabelText(/^Fișierul testului CES/), ces);
    await userEvent.click(choice(/^Generează baremul din test/));
    await userEvent.click(cesBaremChoices().getByRole('radio', { name: /^Generează baremul CES/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Creează testul' }));

    await expectLocation('/teste/9R2-26T1');
    expect(api.createTest).toHaveBeenCalledWith({ classId: 2, title: 'Fracții', cesOff: false });
    expect(api.uploadTestFile).toHaveBeenCalledWith('9R2-26T1', 'test', ces, 'ces');
    expect(api.generateBarem.mock.calls).toEqual([['9R2-26T1'], ['9R2-26T1', 'ces']]);
  });

  it('turned off, hides the CES files, asks nothing for them, and creates the test without them', async () => {
    const api = withCes();
    renderAdmin('/teste/nou', api, <LocationProbe />);
    await fillClassAndTitle('2');
    await userEvent.click(await screen.findByRole('switch', { name: 'Test separat pentru elevii cu CES' }));
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false');
    expect(screen.queryByRole('heading', { level: 2, name: /^Testul CES/ })).not.toBeInTheDocument();
    expect(missingItems()).toEqual(['testul', 'baremul']);
    await userEvent.click(screen.getByRole('button', { name: 'Creează testul' }));
    await expectLocation('/teste/9R2-26T1');
    expect(api.createTest).toHaveBeenCalledWith({ classId: 2, title: 'Fracții', cesOff: true });
    expect(api.uploadTestFile).not.toHaveBeenCalled();
  });
});
