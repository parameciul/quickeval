import { screen } from '@testing-library/react';
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
    students: { 1: [{ id: 10, fullName: 'Pop Ion', active: true }] },
  });

const pdf = (name: string) => new File(['%PDF-1.7'], name, { type: PDF_TYPE });

describe('NewTestPage', () => {
  it('offers the classes that are not archived', async () => {
    renderAdmin('/teste/nou', classes());
    const select = await screen.findByLabelText('Clasa');
    const options = [...(select as HTMLSelectElement).options].map((option) => option.textContent);
    expect(options).toEqual(['Alege clasa', 'Clasa 6E2', 'Clasa 7E2']);
  });

  it('creates the test, uploads the chosen files, and opens the test', async () => {
    const api = classes();
    renderAdmin('/teste/nou', api, <LocationProbe />);
    await userEvent.selectOptions(await screen.findByLabelText('Clasa'), '1');
    await userEvent.type(screen.getByLabelText('Titlul testului'), 'Fracții');
    const test = pdf('Test.pdf');
    const barem = new File(['PK'], 'Barem.docx', { type: DOCX_TYPE });
    await userEvent.upload(screen.getByLabelText('Testul (PDF sau Word, opțional)'), test);
    await userEvent.upload(screen.getByLabelText('Baremul (PDF sau Word, opțional)'), barem);
    await userEvent.click(screen.getByRole('button', { name: 'Creează testul' }));

    await expectLocation('/teste/6E2-26T1');
    expect(api.createTest).toHaveBeenCalledWith({ classId: 1, title: 'Fracții' });
    expect(api.uploadTestFile).toHaveBeenCalledWith('6E2-26T1', 'test', test);
    expect(api.uploadTestFile).toHaveBeenCalledWith('6E2-26T1', 'barem', barem);
  });

  it('picks the class named in the link', async () => {
    renderAdmin('/teste/nou?clasa=2', classes());
    expect(await screen.findByLabelText('Clasa')).toHaveValue('2');
  });

  it('refuses a file that is not PDF or Word before sending anything', async () => {
    const api = classes();
    renderAdmin('/teste/nou', api, <LocationProbe />);
    const user = userEvent.setup({ applyAccept: false });
    await user.selectOptions(await screen.findByLabelText('Clasa'), '1');
    await user.type(screen.getByLabelText('Titlul testului'), 'Fracții');
    await user.upload(screen.getByLabelText('Testul (PDF sau Word, opțional)'), new File(['x'], 'notes.txt', { type: 'text/plain' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Încarcă un fișier PDF sau Word (.docx).');
    await user.click(screen.getByRole('button', { name: 'Creează testul' }));
    await expectLocation('/teste/6E2-26T1');
    expect(api.uploadTestFile).not.toHaveBeenCalled();
  });

  it('opens the new test with a notice when a file fails to upload', async () => {
    const api = classes();
    api.uploadTestFile.mockRejectedValueOnce(new ApiError(413, 'file_too_big', 'Fișierul are peste 25 MB.'));
    renderAdmin('/teste/nou', api, <LocationProbe />);
    await userEvent.selectOptions(await screen.findByLabelText('Clasa'), '1');
    await userEvent.type(screen.getByLabelText('Titlul testului'), 'Fracții');
    await userEvent.upload(screen.getByLabelText('Testul (PDF sau Word, opțional)'), pdf('Test.pdf'));
    await userEvent.click(screen.getByRole('button', { name: 'Creează testul' }));
    await expectLocation('/teste/6E2-26T1 | Testul a fost creat, dar fișierul Test.pdf nu s-a încărcat: Fișierul are peste 25 MB.');
  });

  it('shows the server message when the test cannot be made', async () => {
    const api = classes();
    api.createTest.mockRejectedValueOnce(new ApiError(409, 'class_archived', 'Clasa este arhivată.'));
    renderAdmin('/teste/nou', api);
    await userEvent.selectOptions(await screen.findByLabelText('Clasa'), '2');
    await userEvent.type(screen.getByLabelText('Titlul testului'), 'Fracții');
    await userEvent.click(screen.getByRole('button', { name: 'Creează testul' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Clasa este arhivată.');
  });

  it('asks for a class first when the year has none', async () => {
    renderAdmin('/teste/nou', createFakeApi());
    expect(await screen.findByRole('link', { name: 'Adaugă întâi o clasă.' })).toHaveAttribute('href', '/clase');
  });
});
