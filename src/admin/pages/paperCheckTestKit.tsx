import { act, fireEvent, screen } from '@testing-library/react';
import { vi } from 'vitest';
import type { SubmissionDetail, UploadRow } from '../../../shared/api.ts';
import type { AnswerArea } from '../../../shared/schemas.ts';
import { createFakeApi, fakeEvaluation, fakeItem, fakeSubmission, fakeTest, fakeUpload, reviewPointsOf } from '../../test/fakeApi.ts';
import { t } from '../../i18n/t.ts';

// The points to check on the paper page (spec 2026-11-12 §4): the old address
// of the review opens the page with only the points to check.
export const PAGE = '/tests/6E2-26T1/review';

export const GRADED_AT = '2026-10-07T09:00:00.000Z';

export const photo = (id: number, name: string) => ({ id, name, contentType: 'image/jpeg', size: 1000, position: id });

// Ana: the second page could not be read, and II.1 waits (1p of 2p). Ion:
// I.3 waits (3p of 5p). Eva: nothing to check, a PDF. Dan: not graded yet.
export function papers(): SubmissionDetail[] {
  return [
    fakeSubmission({
      id: 11,
      studentId: 1,
      studentName: 'Ana Pop',
      files: [photo(101, 'a1.jpg'), photo(102, 'a2.jpg'), { id: 103, name: 'a3.pdf', contentType: 'application/pdf', size: 1000, position: 3 }],
      evaluation: fakeEvaluation(
        [
          fakeItem({ id: 31, exerciseId: 'I.1', label: 'Subiectul I, ex. 1', points: 4.5 }),
          fakeItem({
            id: 32,
            exerciseId: 'II.1',
            label: 'Subiectul II, ex. 1',
            points: 1,
            maxPoints: 2,
            studentAnswer: 'x = 3',
            comment: t('Verifică semnul.'),
            needsReview: true,
            reviewReason: t('Scrisul nu se citește.'),
            page: 3,
          }),
        ],
        { unreadable: ['student/page-02.jpg'] },
      ),
    }),
    fakeSubmission({
      id: 14,
      studentId: 4,
      studentName: 'Ion Popa',
      files: [photo(141, 'i1.jpg')],
      evaluation: fakeEvaluation([
        fakeItem({ id: 41, exerciseId: 'I.3', label: 'Subiectul I, ex. 3', points: 3, maxPoints: 5, needsReview: true, reviewReason: t('Răspunsul e tăiat.') }),
      ]),
    }),
    fakeSubmission({
      id: 13,
      studentId: 3,
      studentName: 'Eva Stan',
      files: [{ id: 131, name: 'e.pdf', contentType: 'application/pdf', size: 1000, position: 1 }],
      evaluation: fakeEvaluation([fakeItem({ id: 51, exerciseId: 'I.1', label: 'Subiectul I, ex. 1', points: 4 })]),
    }),
  ];
}

// The uploads table of the same papers, sorted by name, Dan's upload, and
// Mara, who sent nothing.
export function rowsOf(submissions: SubmissionDetail[]): UploadRow[] {
  const rows = submissions.map((paper) =>
    fakeUpload({
      studentId: paper.studentId,
      studentName: paper.studentName,
      submissionId: paper.id,
      status: 'graded',
      fileCount: paper.files.length,
      grade: paper.evaluation!.grade,
      total: paper.evaluation!.total,
      maxTotal: paper.evaluation!.maxTotal,
      flagCount: paper.evaluation!.flagCount,
      reviewPoints: reviewPointsOf(paper.evaluation),
    }),
  );
  rows.push(fakeUpload({ studentId: 2, studentName: 'Dan Marin', submissionId: 12, status: 'submitted', fileCount: 1 }));
  rows.push(fakeUpload({ studentId: 5, studentName: 'Mara Ilie' }));
  return rows.sort((a, b) => a.studentName.localeCompare(b.studentName));
}

export function apiWith(submissions = papers()) {
  return createFakeApi({
    classes: [{ id: 1, name: '6E2', schoolYear: 2026, archived: false, studentCount: 4 }],
    students: {},
    tests: [fakeTest({ status: 'done', startedAt: '2026-10-06T07:00:00.000Z' }, rowsOf(submissions))],
    submissions,
  });
}

// The paper page of one paper, with an open point and a view.
export function paperAt(id: number, key: string | null = null, mode: 'all' | 'review' = 'review'): string {
  const params = new URLSearchParams();
  if (key !== null) params.set('item', key);
  if (mode === 'review') params.set('view', 'review');
  const search = params.toString();
  return `/tests/6E2-26T1/papers/${id}${search ? `?${search}` : ''}`;
}

// The whole address, so a shorter one does not match a longer one.
export const at = (id: number, key: string | null = null, mode: 'all' | 'review' = 'review') =>
  new RegExp(`^${paperAt(id, key, mode).replace(/[?.]/g, '\\$&')}$`);

export const students = () => screen.getByRole('navigation', { name: 'Elevii' });

// How many times one paper was read: the page also reads ahead the papers
// the teacher can move to next.
export const readsOf = (api: ReturnType<typeof apiWith>, id: number) => api.getSubmission.mock.calls.filter(([read]) => read === id).length;

export const decision = () => screen.getByRole('region', { name: 'Decizia' });

export const pause = (ms: number) => act(() => new Promise((resolve) => setTimeout(resolve, ms)));

export const row = (label: string) => screen.getByRole('row', { name: new RegExp(label) });

// The page of the paper zooms inside the middle pane. jsdom lays nothing out:
// the pane is given a size of 400 × 400 px.
export const pane = () => screen.getByTestId('zoom-pane');

export const layer = () => pane().firstElementChild as HTMLElement;

export function sizedPane(): HTMLElement {
  const element = pane();
  element.getBoundingClientRect = () => ({ left: 0, top: 0, right: 400, bottom: 400, width: 400, height: 400, x: 0, y: 0, toJSON: () => ({}) });
  return element;
}

export function clickAt(element: HTMLElement, clientX: number, clientY: number, button = 0) {
  fireEvent.pointerDown(element, { pointerId: 1, button, clientX, clientY });
  fireEvent.pointerUp(element, { pointerId: 1, button, clientX, clientY });
}

export const WHOLE = 'translate(0%, 0%) scale(1)';

// Ion's I.3 in two parts, given out of page order: the second page, then the
// first. II.4 waits too, on the first page. Ion has two photo pages here.
export const TOP = { page: 1, x0: 0.2, y0: 0.3, x1: 0.6, y1: 0.4 };

export const LOW = { page: 2, x0: 0.1, y0: 0.5, x1: 0.9, y1: 0.8 };

export const OTHER = { page: 1, x0: 0.1, y0: 0.02, x1: 0.5, y1: 0.12 };

export function framed(areas: AnswerArea[] = [LOW, TOP]): SubmissionDetail[] {
  const list = papers();
  const ion = list[1]!;
  ion.files = [photo(141, 'i1.jpg'), photo(142, 'i2.jpg')];
  ion.evaluation = fakeEvaluation([
    fakeItem({ id: 41, exerciseId: 'I.3', label: 'Subiectul I, ex. 3', points: 3, maxPoints: 5, needsReview: true, reviewReason: t('Răspunsul e tăiat.'), areas }),
    fakeItem({ id: 42, exerciseId: 'II.4', label: 'Subiectul II, ex. 4', points: 1, maxPoints: 2, needsReview: true, reviewReason: 'Neclar.', areas: [OTHER] }),
  ]);
  return list;
}

export const frame = () => screen.getByTestId('answer-frame');

export const ION_I3 = `${PAGE}?paper=14&item=41`;

// A phone: a finger, not a mouse, presses the controls.
export const onPhone = () =>
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query === '(pointer: coarse)',
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));

// A screen of a given width, touched with a finger: the media queries of
// brand.css that the page asks about.
export const screenOf = (width: number) =>
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches:
      query === '(pointer: coarse)' ||
      (query === '(max-width: 56.25rem)' && width <= 900) ||
      (query === '(max-width: 48rem)' && width <= 768),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));

export const openRow = () => document.querySelector<HTMLElement>('table.items tr.is-open')!;

// jsdom has no scrollIntoView: a fake one, which records the element it ran on.
export function stubScroll() {
  const scroll = vi.fn();
  Object.defineProperty(Element.prototype, 'scrollIntoView', { value: scroll, configurable: true, writable: true });
  return scroll;
}

// A photo box taller pages than itself, as with a wide paper of the teacher's
// own: the box is 1000px high and scrolls, the page in it 1500px high, 100px
// under the box's top. jsdom draws nothing, so the layout is made up here.
export function tallPhotoBox() {
  const scrolled = new WeakMap<Element, number>();
  const own = (element: Element, name: 'scrollHeight' | 'clientHeight') =>
    element.classList.contains('zoom-scroll') ? (name === 'scrollHeight' ? 2000 : 1000) : 0;
  const restore = [
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(function (this: HTMLElement) {
      return own(this, 'scrollHeight');
    }),
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(function (this: HTMLElement) {
      return own(this, 'clientHeight');
    }),
    vi.spyOn(Element.prototype, 'scrollTop', 'get').mockImplementation(function (this: Element) {
      return scrolled.get(this) ?? 0;
    }),
    vi.spyOn(Element.prototype, 'scrollTop', 'set').mockImplementation(function (this: Element, value: number) {
      scrolled.set(this, value);
    }),
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      const scroll = this.closest('.zoom-scroll') ? (scrolled.get(this.closest('.zoom-scroll')!) ?? 0) : 0;
      const pane = this.classList.contains('zoom-pane');
      const top = pane ? 100 - scroll : 0;
      const height = pane ? 1500 : 0;
      return { top, bottom: top + height, height, left: 0, right: 0, width: 0, x: 0, y: top, toJSON: () => ({}) } as DOMRect;
    }),
  ];
  return () => {
    for (const spy of restore) spy.mockRestore();
  };
}
