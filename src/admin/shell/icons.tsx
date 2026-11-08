// The shell's line icons: 1.5px strokes on a 20px grid, in the text colour.
// They sit beside a visible word, so screen readers skip them.
const LINE = {
  viewBox: '0 0 20 20',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
  focusable: false,
} as const;

export function IconPlus() {
  return (
    <svg {...LINE} strokeWidth={2}>
      <path d="M10 4v12M4 10h12" />
    </svg>
  );
}

export function IconTests() {
  return (
    <svg {...LINE}>
      <path d="M5 2.75h7l3 3v11.5H5z" />
      <path d="M8 9h4.5M8 12h4.5" />
    </svg>
  );
}

export function IconClasses() {
  return (
    <svg {...LINE}>
      <circle cx="7.5" cy="7" r="2.75" />
      <path d="M2.75 16c.6-2.6 2.5-4 4.75-4s4.15 1.4 4.75 4" />
      <path d="M13 4.6a2.6 2.6 0 0 1 0 5M14.5 12.2c1.4.5 2.4 1.8 2.75 3.8" />
    </svg>
  );
}

export function IconTodo() {
  return (
    <svg {...LINE}>
      <path d="M3.25 5.5l1.5 1.5 2.5-2.75M3.25 12.5l1.5 1.5 2.5-2.75" />
      <path d="M10.5 6h6.25M10.5 13h6.25" />
    </svg>
  );
}

export function IconSettings() {
  return (
    <svg {...LINE}>
      <circle cx="10" cy="10" r="2.5" />
      <path d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M4.7 15.3l1.4-1.4M13.9 6.1l1.4-1.4" />
    </svg>
  );
}

export function IconMenu() {
  return (
    <svg {...LINE} strokeWidth={1.6}>
      <path d="M3 5.5h14M3 10h14M3 14.5h14" />
    </svg>
  );
}

export function IconClose() {
  return (
    <svg {...LINE} strokeWidth={1.6}>
      <path d="M5 5l10 10M15 5L5 15" />
    </svg>
  );
}

export function IconDone() {
  return (
    <svg {...LINE} strokeWidth={2}>
      <path d="m4.5 10.5 3.5 3.5 7.5-8" />
    </svg>
  );
}

export function IconQr() {
  return (
    <svg {...LINE}>
      <path d="M3 3h5v5H3zM12 3h5v5h-5zM3 12h5v5H3z" />
      <path d="M12 12h2v2h-2zM15 15h2v2h-2zM15 12h2M12 16v1" />
    </svg>
  );
}

export function IconClock() {
  return (
    <svg {...LINE}>
      <circle cx="10" cy="10" r="7" />
      <path d="M10 6v4l2.5 2" />
    </svg>
  );
}

export function IconSearch() {
  return (
    <svg {...LINE} strokeWidth={1.7}>
      <circle cx="8.75" cy="8.75" r="5.25" />
      <path d="m12.75 12.75 4 4" />
    </svg>
  );
}

export function IconBack() {
  return (
    <svg {...LINE} strokeWidth={1.8}>
      <path d="M12.5 4.5 7 10l5.5 5.5" />
    </svg>
  );
}
