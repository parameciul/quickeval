import { describe, expect, it } from 'vitest';
import { fakeTeacher } from '../../test/fakeApi.ts';
import { demoLine, demoUsage } from './DemoMeters.tsx';

const demo = (testsEvaluated: number, papersGraded: number, papersWaiting = 0) =>
  demoUsage(fakeTeacher({ role: 'teacher', demo: true, testsEvaluated, papersGraded, papersWaiting }));

describe('demoUsage', () => {
  it('counts the one test once, whatever the regrades', () => {
    expect(demo(0, 0).testUsed).toBe(false);
    expect(demo(1, 3).testUsed).toBe(true);
    expect(demo(4, 30).testUsed).toBe(true);
  });

  it('counts the papers on their way to the robot as used, never over the limit', () => {
    expect(demo(1, 18, 2)).toEqual({ testUsed: true, papersUsed: 20, papersLeft: 15 });
    expect(demo(1, 34, 4)).toEqual({ testUsed: true, papersUsed: 35, papersLeft: 0 });
  });
});

describe('demoLine', () => {
  it.each([
    [demo(1, 34), 'Mai ai 1 lucrare, pentru testul tău. Fiecare lucrare corectată se numără, și o recorectare.'],
    [demo(1, 20), 'Mai ai 15 lucrări, pentru testul tău. Fiecare lucrare corectată se numără, și o recorectare.'],
    [demo(0, 0), 'Mai ai 35 de lucrări, pentru testul tău. Fiecare lucrare corectată se numără, și o recorectare.'],
    [demo(1, 35), 'Ai folosit toate cele 35 de lucrări ale contului demo. Cere unui administrator un cont complet.'],
  ])('says what is left: %j', (usage, line) => {
    expect(demoLine(usage)).toBe(line);
  });
});
