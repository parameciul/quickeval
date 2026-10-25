import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TestInfo } from '../../../shared/api.ts';
import { DOCX_TYPE, PDF_TYPE } from '../../../shared/files.ts';
import { robotStartMessage } from '../../ui/format.ts';
import { createFakeApi, FAKE_TOKEN, fakeTest } from '../../test/fakeApi.ts';
import { renderAdmin } from '../../test/renderAdmin.tsx';

// The robot line of an open test whose print PDF (the test with the QR code)
// waits for the robot.

const FILES = { test: { name: 'Test.docx', type: DOCX_TYPE }, barem: { name: 'Barem.pdf', type: PDF_TYPE } };
const NEVER_CHECKED = 'Robotul nu a verificat încă dacă are lucrări de corectat.';

function apiWith(overrides: Partial<TestInfo>, startFailed = false) {
  const detail = fakeTest({ status: 'open', uploadToken: FAKE_TOKEN, files: FILES, ...overrides });
  detail.robot.startFailed = startFailed;
  return createFakeApi({
    classes: [{ id: 1, name: '6E2', schoolYear: 2026, archived: false, studentCount: 0 }],
    students: {},
    tests: [detail],
  });
}

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('TestPage and the print PDF', () => {
  it('shows the robot line and starts the robot while the print PDF waits', async () => {
    const api = apiWith({});
    renderAdmin('/teste/6E2-26T1', api);
    expect(await screen.findByText('Se pregătește testul cu cod QR…')).toBeInTheDocument();
    expect(screen.getByText(NEVER_CHECKED)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Pornește robotul' }));
    expect(api.startRobot).toHaveBeenCalledWith('6E2-26T1');
    expect(await screen.findByText(robotStartMessage('next_check'))).toBeInTheDocument();
  });

  it.each([
    ['is ready', { print: { status: 'ready', fromWord: true } }],
    ['failed', { print: { status: 'failed', fromWord: true } }],
    ['has no test file yet', { files: { test: null, barem: null } }],
  ] as const)('shows no robot line while the print PDF %s', async (_name, overrides) => {
    renderAdmin('/teste/6E2-26T1', apiWith(overrides, true));
    expect(await screen.findByRole('heading', { name: 'Testul pentru tipărit' })).toBeInTheDocument();
    expect(screen.queryByText(NEVER_CHECKED)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Pornește robotul' })).not.toBeInTheDocument();
    expect(screen.queryByText(robotStartMessage('next_check'))).not.toBeInTheDocument();
  });

  it('says that the robot did not start for the print PDF, also after a reload', async () => {
    renderAdmin('/teste/6E2-26T1', apiWith({}, true));
    expect(await screen.findByText(robotStartMessage('next_check'))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pornește robotul' })).toBeInTheDocument();
  });

  it('says that the robot started after a reopen that makes the print PDF', async () => {
    const api = apiWith({ status: 'done' });
    renderAdmin('/teste/6E2-26T1', api);
    await userEvent.click(await screen.findByRole('button', { name: 'Redeschide încărcarea' }));
    expect(api.reopenTest).toHaveBeenCalledWith('6E2-26T1');
    expect(await screen.findByText(robotStartMessage('dispatched'))).toBeInTheDocument();
    expect(await screen.findByText('Se pregătește testul cu cod QR…')).toBeInTheDocument();
  });

  it('says nothing after a reopen whose print PDF is ready', async () => {
    const api = apiWith({ status: 'done', print: { status: 'ready', fromWord: false } });
    renderAdmin('/teste/6E2-26T1', api);
    await userEvent.click(await screen.findByRole('button', { name: 'Redeschide încărcarea' }));
    expect(await screen.findByRole('link', { name: 'Descarcă testul cu cod QR' })).toBeInTheDocument();
    expect(screen.queryByText(robotStartMessage('dispatched'))).not.toBeInTheDocument();
  });
});
