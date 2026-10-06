// Laura Miron's initials over a highlighter stroke, as in the Website header.
// Coloured by --ink (currentColor) and --brand-marker, so both themes work.
export function BrandMark() {
  return (
    <svg className="brand-mark" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <path d="M10 48h44" fill="none" stroke="var(--brand-marker)" strokeWidth="12" strokeLinecap="round" />
      <g fill="none" stroke="currentColor" strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M25 13c-3 11-6 21-9 31 7 0 13-2 18-6" />
        <path d="M33 45l4-23 6 13 8-15 2 25" />
      </g>
    </svg>
  );
}
