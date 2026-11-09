import { describe, expect, it } from 'vitest';
import { PDF_TYPE } from '../../../shared/files.ts';
import { fakeTest, fakeUpload, noCesVariant } from '../../test/fakeApi.ts';
import { waitsForRobot } from './StartRobotButton.tsx';

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
