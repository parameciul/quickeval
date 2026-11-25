import { describe, expect, it } from 'vitest';
import { PDF_TYPE } from '../../../shared/files.ts';
import { fakeTest, fakeUpload, noCesVariant } from '../../test/fakeApi.ts';
import { waitsForBarem, waitsForRobot } from './StartRobotButton.tsx';

// The CES papers that wait for the teacher are no work for the robot.

const file = { name: 'f.pdf', type: PDF_TYPE };
const waiting = [fakeUpload({ studentId: 1, studentName: 'Bursașiu Teodor', submissionId: 11, status: 'submitted', ces: true })];

function evaluating(exerciseList: 'none' | 'ready' | 'problem' | 'failed') {
  return fakeTest({
    status: 'evaluating',
    ces: noCesVariant({ studentCount: 1, files: { test: file, barem: file }, waiting: 1, exerciseList: { status: exerciseList, message: null } }),
  }).test;
}

describe('waitsForRobot and the CES papers', () => {
  it('counts a waiting CES paper as robot work while its exercise list is to make or ready', () => {
    expect(waitsForRobot(evaluating('none'), waiting)).toBe(true);
    expect(waitsForRobot(evaluating('ready'), waiting)).toBe(true);
  });

  it('does not count it while its exercise list waits for the teacher', () => {
    expect(waitsForRobot(evaluating('problem'), waiting)).toBe(false);
    expect(waitsForRobot(evaluating('failed'), waiting)).toBe(false);
  });
});

describe('the class barem and the robot', () => {
  const classPaper = [fakeUpload({ studentId: 2, studentName: 'Ene Ana', submissionId: 12, status: 'submitted' })];
  const withBarem = (status: 'open' | 'evaluating' | 'done', barem: { request: 'none' | 'requested' | 'failed'; unchecked: boolean }) =>
    fakeTest({ status, files: { test: file, barem: file }, barem, exerciseList: { status: 'ready', message: null } }).test;

  // A barem can be asked for in any status, so the robot may be started for it.
  it('counts a requested barem as robot work in any status', () => {
    for (const status of ['open', 'evaluating', 'done'] as const) {
      expect(waitsForBarem(withBarem(status, { request: 'requested', unchecked: false })), status).toBe(true);
      expect(waitsForRobot(withBarem(status, { request: 'requested', unchecked: false }), []), status).toBe(true);
    }
    expect(waitsForBarem(withBarem('done', { request: 'failed', unchecked: true }))).toBe(false);
  });

  it('holds the class papers back while the barem waits for its check', () => {
    expect(waitsForRobot(withBarem('evaluating', { request: 'none', unchecked: true }), classPaper)).toBe(false);
    expect(waitsForRobot(withBarem('evaluating', { request: 'none', unchecked: false }), classPaper)).toBe(true);
  });
});
