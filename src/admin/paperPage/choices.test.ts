import { describe, expect, it } from 'vitest';
import { pointChoices } from './choices.ts';

describe('pointChoices', () => {
  it('offers steps of 0,25 up to 2 points', () => {
    expect(pointChoices(1.5, 0.75)).toEqual([0, 0.25, 0.5, 0.75, 1, 1.25, 1.5]);
    expect(pointChoices(2, 1)).toEqual([0, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]);
  });

  it('offers steps of 0,5 up to 5 points, and of 1 above', () => {
    expect(pointChoices(5, 3)).toEqual([0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5]);
    expect(pointChoices(10, 7)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it("always offers the robot's points, also off the steps", () => {
    expect(pointChoices(1.5, 0.3)).toEqual([0, 0.25, 0.3, 0.5, 0.75, 1, 1.25, 1.5]);
    expect(pointChoices(4.5, 4.5)).toEqual([0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5]);
  });

  it('ends on a maximum off the steps', () => {
    expect(pointChoices(2.2, 0)).toEqual([0, 0.5, 1, 1.5, 2, 2.2]);
  });
});
