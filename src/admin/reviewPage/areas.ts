import type { SubmissionFile } from '../../../shared/api.ts';
import type { AnswerArea } from '../../../shared/schemas.ts';

// The areas of an answer that the review draws: on a photo page that the paper
// has (a PDF page has no zoom and no border), in page order. An answer left
// with none opens as one the robot gave no area for.
export function drawnAreas(areas: readonly AnswerArea[], files: readonly SubmissionFile[]): AnswerArea[] {
  return areas
    .filter((area) => area.page >= 1 && area.page <= files.length && files[area.page - 1]!.contentType.startsWith('image/'))
    .sort((a, b) => a.page - b.page);
}

// "Arată chenarul": the teacher's choice, kept in this browser. On unless she
// turned it off; storage that is blocked keeps it on.
const FRAMES_KEY = 'quickeval:reviewFrames';

export function savedFrames(): boolean {
  try {
    return localStorage.getItem(FRAMES_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function saveFrames(on: boolean): void {
  try {
    localStorage.setItem(FRAMES_KEY, on ? 'on' : 'off');
  } catch {
    // Storage can be blocked; the choice then lasts until the page reloads.
  }
}
