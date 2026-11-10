import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { PDF_TYPE } from '../../shared/files.ts';
import { createFakeApi } from '../test/fakeApi.ts';
import { createFakeTryApi, renderTry, TRY_CODE, tryTest } from '../test/fakeTryApi.tsx';

const files = { test: { name: 'test.pdf', type: PDF_TYPE }, barem: { name: 'barem.pdf', type: PDF_TYPE } };

function setup(...args: Parameters<typeof tryTest>) {
  const api = createFakeApi({ classes: [], students: {}, tests: [tryTest(...args)] });
  renderTry('/', api, createFakeTryApi());
  return api;
}

describe('a try while the robot works', () => {
  it('says the paper is being graded, with no start button', async () => {
    setup({ status: 'evaluating', files }, { status: 'submitted' });
    expect(await screen.findByRole('heading', { name: 'Lucrarea se corectează' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Pornește corectarea' })).not.toBeInTheDocument();
  });

  it('lets her grade with a barem whose points do not add up, as the app does', async () => {
    const api = setup(
      { status: 'evaluating', files, exerciseList: { status: 'problem', message: 'Punctajele dau 9, nu 10.' } },
      { status: 'submitted' },
    );
    expect(await screen.findByText('Baremul are o problemă.')).toBeInTheDocument();
    expect(screen.getByText('Punctajele dau 9, nu 10.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Folosește oricum' }));
    expect(api.acceptExerciseList).toHaveBeenCalledWith(TRY_CODE);
  });

  it('takes another barem when the barem has a problem', async () => {
    const api = setup({ status: 'evaluating', files, exerciseList: { status: 'problem', message: 'Lipsește ex. 3.' } }, { status: 'submitted' });
    const file = new File(['%PDF-1.7'], 'barem2.pdf', { type: PDF_TYPE });
    await userEvent.upload(await screen.findByLabelText(/Fișierul baremului/), file);
    await waitFor(() => expect(api.uploadTestFile).toHaveBeenCalledWith(TRY_CODE, 'barem', file));
  });
});

describe('a try that failed', () => {
  it('says the robot could not make the barem, and gives no retry', async () => {
    setup({ files: { test: files.test, barem: null }, barem: { request: 'failed', unchecked: false } });
    expect(await screen.findByRole('heading', { name: 'Încercarea nu a reușit' })).toBeInTheDocument();
    expect(screen.getByText('Robotul nu a putut face baremul din test.')).toBeInTheDocument();
    expect(screen.getByText(/nu se numără în limita ta de azi/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Fă o încercare nouă' })).toHaveAttribute('href', '/');
    expect(screen.queryByRole('button', { name: /Încearcă din nou|Reîncearcă/ })).not.toBeInTheDocument();
  });

  it('says the robot could not read the test and the barem', async () => {
    setup({ status: 'evaluating', files, exerciseList: { status: 'failed', message: 'Fișierul nu se deschide.' } }, { status: 'submitted' });
    expect(await screen.findByText('Robotul nu a putut citi testul și baremul.')).toBeInTheDocument();
    expect(screen.getByText('Fișierul nu se deschide.')).toBeInTheDocument();
  });

  it('says the robot could not grade the paper', async () => {
    setup({ status: 'evaluating', files }, { status: 'failed' });
    expect(await screen.findByText('Robotul nu a putut corecta lucrarea.')).toBeInTheDocument();
  });
});
