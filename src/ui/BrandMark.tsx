// The MQGrader mark: a score ring, and an orange tick that breaks out through
// its gap. Coloured by --mark-from, --mark-to and --mark-tick, so both themes
// work. A page shows one mark, so the gradient id is fixed.
export function BrandMark() {
  return (
    <svg className="brand-mark" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="brand-mark-ring" gradientUnits="userSpaceOnUse" x1="12" y1="12" x2="52" y2="52">
          <stop offset="0" style={{ stopColor: 'var(--mark-from)' }} />
          <stop offset="1" style={{ stopColor: 'var(--mark-to)' }} />
        </linearGradient>
      </defs>
      <path
        d="M48.42 27.6A17 17 0 1 1 36.4 15.58"
        fill="none"
        stroke="url(#brand-mark-ring)"
        strokeWidth="6"
        strokeLinecap="round"
      />
      <path
        d="M23 32L30 39L49 18"
        fill="none"
        stroke="var(--mark-tick)"
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
