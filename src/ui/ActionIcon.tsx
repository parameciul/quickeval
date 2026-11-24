import type { ReactNode } from 'react';

// The icon of an action button: one per verb, so a verb looks the same on
// every page of every app. Line icons in the style of the shell's
// (`admin/shell/icons.tsx`): 1.5px strokes on a 20px grid, in the button's
// text colour. The icon sits beside a visible word (or under the button's
// aria-label), so screen readers skip it.
const PATHS = {
  add: <path d="M10 4v12M4 10h12" />,
  'add-person': (
    <>
      <circle cx="8" cy="7" r="3" />
      <path d="M2.75 16.5c.7-3 2.8-4.5 5.25-4.5s4.55 1.5 5.25 4.5M15.5 6v5M13 8.5h5" />
    </>
  ),
  // A label tag: a student marked CES, and the same tag struck out to take
  // the mark away.
  ces: (
    <>
      <path d="M3.5 3.5h6l7 7-6 6-7-7z" />
      <circle cx="7" cy="7" r="1.1" />
    </>
  ),
  'ces-off': (
    <>
      <path d="M3.5 3.5h6l7 7-6 6-7-7z" />
      <circle cx="7" cy="7" r="1.1" />
      <path d="M2.5 17.5l15-15" />
    </>
  ),
  // A person with an arrow out of the class, and back in.
  leave: (
    <>
      <circle cx="7.5" cy="7" r="3" />
      <path d="M2.25 16.5c.7-3 2.8-4.5 5.25-4.5 1.3 0 2.5.4 3.4 1.2M13 13h5M15.75 10.25 18.5 13l-2.75 2.75" />
    </>
  ),
  'back-in': (
    <>
      <circle cx="7.5" cy="7" r="3" />
      <path d="M2.25 16.5c.7-3 2.8-4.5 5.25-4.5 1.3 0 2.5.4 3.4 1.2M18.5 13h-5M15.75 10.25 13 13l2.75 2.75" />
    </>
  ),
  person: (
    <>
      <circle cx="10" cy="7" r="3" />
      <path d="M4.75 16.5c.7-3 2.8-4.5 5.25-4.5s4.55 1.5 5.25 4.5" />
    </>
  ),
  lock: (
    <>
      <rect x="4" y="9" width="12" height="8" rx="1.5" />
      <path d="M7 9V6.5a3 3 0 0 1 6 0V9" />
    </>
  ),
  archive: <path d="M3 4.5h14v3H3zM4.5 7.5v8.5h11V7.5M8 10.5h4" />,
  unarchive: <path d="M3 4.5h14v3H3zM4.5 7.5v8.5h11V7.5M10 15v-4.5M7.75 12.5 10 10.25l2.25 2.25" />,
  arrow: <path d="M4 10h11.5M11 5.5l4.5 4.5-4.5 4.5" />,
  back: <path d="M16 10H4.5M9 5.5 4.5 10 9 14.5" />,
  camera: (
    <>
      <path d="M3 6.5h3l1.5-2h5l1.5 2h3v9.5H3z" />
      <circle cx="10" cy="11" r="3" />
    </>
  ),
  // The school year, in the phone menu.
  calendar: (
    <>
      <rect x="3.5" y="4.5" width="13" height="12" rx="1.5" />
      <path d="M3.5 8.5h13M7 3v3M13 3v3" />
    </>
  ),
  check: <path d="M4 10.5l4 4 8-9" />,
  clock: (
    <>
      <circle cx="10" cy="10" r="6.75" />
      <path d="M10 6v4l2.75 1.75" />
    </>
  ),
  close: <path d="M5 5l10 10M15 5L5 15" />,
  // A filled dot: a thing that waits on the teacher, in a stage's list.
  dot: <circle cx="10" cy="10" r="2.5" fill="currentColor" />,
  copy: (
    <>
      <rect x="7" y="7" width="9.5" height="9.5" rx="1.5" />
      <path d="M13 4.5v-1H3.5V13h1" />
    </>
  ),
  download: <path d="M10 3.5v9M6.5 9l3.5 3.5L13.5 9M4 14.5v2h12v-2" />,
  edit: <path d="M12.5 4.5l3 3-8 8h-3v-3zM11 6l3 3" />,
  // The QR code on the whole screen.
  expand: <path d="M7.5 3.5h-4v4M12.5 3.5h4v4M7.5 16.5h-4v-4M12.5 16.5h4v-4" />,
  doc: <path d="M5 2.75h7l3 3v11.5H5zM8 9h4.5M8 12h4.5" />,
  // The language, in the phone menu.
  globe: (
    <>
      <circle cx="10" cy="10" r="6.75" />
      <path d="M3.25 10h13.5M10 3.25c1.9 1.9 2.75 4.2 2.75 6.75S11.9 14.85 10 16.75C8.1 14.85 7.25 12.55 7.25 10S8.1 5.15 10 3.25z" />
    </>
  ),
  // The dark theme, in the phone menu.
  moon: <path d="M16.5 12A6.5 6.5 0 0 1 8 3.5a6.5 6.5 0 1 0 8.5 8.5z" />,
  phone: (
    <>
      <rect x="5.5" y="2.5" width="9" height="15" rx="2" />
      <path d="M9 14.5h2" />
    </>
  ),
  sliders: (
    <>
      <path d="M3.5 6h7M15 6h1.5M3.5 14h1.5M9.5 14h7" />
      <circle cx="12.75" cy="6" r="2" />
      <circle cx="7.25" cy="14" r="2" />
    </>
  ),
  eye: (
    <>
      <path d="M2.5 10S5.25 5 10 5s7.5 5 7.5 5-2.75 5-7.5 5-7.5-5-7.5-5z" />
      <circle cx="10" cy="10" r="2.25" />
    </>
  ),
  'eye-off': <path d="M2.5 10S5.25 5 10 5c1.4 0 2.6.4 3.6 1M17.5 10s-2.75 5-7.5 5c-1.4 0-2.6-.4-3.6-1M3.5 16.5l13-13" />,
  file: <path d="M5 2.75h7l3 3v11.5H5zM10 8v5.5M8 11.5l2 2 2-2" />,
  generate: <path d="M10 3.5c.6 3.4 3.1 5.9 6.5 6.5-3.4.6-5.9 3.1-6.5 6.5-.6-3.4-3.1-5.9-6.5-6.5 3.4-.6 5.9-3.1 6.5-6.5z" />,
  info: (
    <>
      <circle cx="10" cy="10" r="6.75" />
      <path d="M10 9v4.5M10 6.25h.01" />
    </>
  ),
  key: (
    <>
      <circle cx="6.5" cy="13.5" r="3" />
      <path d="M8.6 11.4 16 4M13.5 6.5l2 2" />
    </>
  ),
  link: (
    <path d="M8.5 11.5l3-3M9.5 6.5l1.25-1.25a3 3 0 0 1 4.25 4.25L13.5 10.75M10.5 13.5l-1.25 1.25a3 3 0 0 1-4.25-4.25L6.5 9.25" />
  ),
  list: <path d="M7.5 5.5h9M7.5 10h9M7.5 14.5h9M3.75 5.5h.01M3.75 10h.01M3.75 14.5h.01" />,
  login: <path d="M12 3.5h4v13h-4M3.5 10H12M8.5 6.5 12 10l-3.5 3.5" />,
  logout: <path d="M8 3.5H4v13h4M8.5 10h8M13.5 6.5 17 10l-3.5 3.5" />,
  // Three dots: a menu of more actions, where its words do not fit (a phone).
  more: (
    <>
      <circle cx="4.5" cy="10" r="1" fill="currentColor" />
      <circle cx="10" cy="10" r="1" fill="currentColor" />
      <circle cx="15.5" cy="10" r="1" fill="currentColor" />
    </>
  ),
  open: <path d="M11 3.5h5.5V9M16.5 3.5l-7 7M14 12v4.5H3.5V6H8" />,
  // A side panel: folds the list of students beside the paper, or shows it.
  panel: <path d="M4.5 4h11A1.5 1.5 0 0 1 17 5.5v9a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 3 14.5v-9A1.5 1.5 0 0 1 4.5 4zM8 4v12" />,
  pay: (
    <>
      <rect x="2.75" y="4.75" width="14.5" height="10.5" rx="1.5" />
      <path d="M2.75 8.25h14.5M5.5 12h3" />
    </>
  ),
  play: <path d="M6.5 4.5v11l9-5.5z" />,
  print: <path d="M6 7.5V3h8v4.5M6.5 13.5H4v-6h12v6h-2.5M6.5 11h7v6h-7z" />,
  qr: (
    <path d="M3.5 3.5h5v5h-5zM11.5 3.5h5v5h-5zM3.5 11.5h5v5h-5zM11.5 11.5h2v2h-2zM14.5 14.5h2v2h-2zM11.5 15.5v1M15.5 11.5h1" />
  ),
  report: <path d="M4 16.5V9M8 16.5v-12M12 16.5V11M16 16.5V7" />,
  retry: <path d="M15.5 10a5.5 5.5 0 1 1-1.6-3.9M14.5 3v3.5H11" />,
  search: (
    <>
      <circle cx="8.75" cy="8.75" r="5" />
      <path d="M12.5 12.5l4 4" />
    </>
  ),
  send: <path d="M17 3 3 9l5.5 2.5L11 17zM8.5 11.5 17 3" />,
  share: (
    <>
      <circle cx="5.5" cy="10" r="2" />
      <circle cx="14.5" cy="5" r="2" />
      <circle cx="14.5" cy="15" r="2" />
      <path d="M7.3 9l5.4-3M7.3 11l5.4 3" />
    </>
  ),
  stop: <rect x="5" y="5" width="10" height="10" rx="1.5" />,
  // An open book: the subject of a test.
  subject: <path d="M10 5.5C8.5 4.25 6.25 3.75 3.5 4v11.5c2.75-.25 5 .25 6.5 1.5 1.5-1.25 3.75-1.75 6.5-1.5V4c-2.75-.25-5 .25-6.5 1.5zM10 5.5V17" />,
  trash: <path d="M3.5 5.5h13M8 5.5v-2h4v2M5 5.5l.75 11h8.5l.75-11M8.5 8.5v5M11.5 8.5v5" />,
  unlock: (
    <>
      <rect x="4" y="9" width="12" height="8" rx="1.5" />
      <path d="M7 9V6.5a3 3 0 0 1 5.8-1.1" />
    </>
  ),
  upload: <path d="M10 13V3.5M6.5 7 10 3.5 13.5 7M4 14.5v2h12v-2" />,
} satisfies Record<string, ReactNode>;

export type ActionIconName = keyof typeof PATHS;

export const ACTION_ICON_NAMES = Object.keys(PATHS) as ActionIconName[];

export function ActionIcon({ name }: { name: ActionIconName }) {
  return (
    <svg
      className="action-icon"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  );
}

// The icon of a button whose words come from data (a test's next step, a task
// of "De făcut"): its first word is the verb.
const BY_VERB: Record<string, ActionIconName> = {
  Încarcă: 'upload',
  Generează: 'generate',
  Verifică: 'search',
  Deschide: 'open',
  Începe: 'play',
  Pornește: 'play',
  Oprește: 'eye-off',
  Publică: 'eye',
  Raportul: 'report',
};

export function actionIconFor(label: string): ActionIconName {
  return BY_VERB[label.split(' ')[0] ?? ''] ?? 'arrow';
}
