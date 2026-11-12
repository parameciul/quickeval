import { round2 } from '../../../shared/scoring.ts';

// The points the decision offers as buttons, from 0 to the exercise's
// maximum: in steps of 0,25 up to 2 points, of 0,5 up to 5, else of 1, so a
// row of buttons stays short. The robot's points are always one of them,
// also off those steps; any other value is typed in "Alt punctaj".
export function pointChoices(maxPoints: number, robotPoints: number): number[] {
  const step = maxPoints <= 2 ? 0.25 : maxPoints <= 5 ? 0.5 : 1;
  const choices: number[] = [];
  for (let value = 0; value < maxPoints - 1e-9; value = round2(value + step)) choices.push(value);
  choices.push(maxPoints);
  if (!choices.includes(robotPoints) && robotPoints >= 0 && robotPoints <= maxPoints) choices.push(robotPoints);
  return choices.sort((a, b) => a - b);
}
