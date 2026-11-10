import { describe, expect, it } from 'vitest';
import { tryTest } from '../test/fakeTryApi.tsx';
import { fileChangesLeft, phaseOf, refreshOf } from './phase.ts';

describe('phaseOf', () => {
  it('prepares while the paper was not sent', () => {
    expect(phaseOf(tryTest())).toBe('prepare');
    expect(phaseOf(tryTest({ barem: { request: 'requested', unchecked: false } }))).toBe('prepare');
    expect(phaseOf(tryTest({ barem: { request: 'none', unchecked: true } }))).toBe('prepare');
  });

  it('grades once the paper was sent, and asks when the barem has a problem', () => {
    expect(phaseOf(tryTest({ status: 'evaluating' }, { status: 'submitted' }))).toBe('grading');
    expect(phaseOf(tryTest({ status: 'evaluating' }, { status: 'grading' }))).toBe('grading');
    expect(phaseOf(tryTest({ status: 'evaluating', exerciseList: { status: 'problem', message: 'Totalul este 9.' } }, { status: 'submitted' }))).toBe(
      'problem',
    );
  });

  it('fails as the server gives the place back: barem, exercise list, or paper', () => {
    expect(phaseOf(tryTest({ barem: { request: 'failed', unchecked: false } }))).toBe('failed');
    expect(phaseOf(tryTest({ status: 'evaluating', exerciseList: { status: 'failed', message: null } }, { status: 'submitted' }))).toBe('failed');
    expect(phaseOf(tryTest({ status: 'evaluating' }, { status: 'failed' }))).toBe('failed');
  });

  it('is graded once the paper is', () => {
    expect(phaseOf(tryTest({ status: 'done' }, { status: 'graded' }))).toBe('graded');
  });
});

describe('refreshOf', () => {
  it('reads again every 10 s only while the robot works for the try', () => {
    expect(refreshOf(undefined)).toBe(false);
    expect(refreshOf(tryTest())).toBe(false);
    expect(refreshOf(tryTest({ barem: { request: 'requested', unchecked: false } }))).toBe(10_000);
    expect(refreshOf(tryTest({ status: 'evaluating' }, { status: 'submitted' }))).toBe(10_000);
    expect(refreshOf(tryTest({ status: 'done' }, { status: 'graded' }))).toBe(false);
  });
});

describe('fileChangesLeft', () => {
  it('counts down from 6 and stops at 0', () => {
    expect(fileChangesLeft(tryTest())).toBe(6);
    expect(fileChangesLeft(tryTest({ filesVersion: 2 }))).toBe(4);
    expect(fileChangesLeft(tryTest({ filesVersion: 7 }))).toBe(0);
  });
});
