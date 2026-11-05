// The MQGrader mark, "Trei subiecte" (redesign spec §2.4): three arcs of one
// ring, two blue and one orange, coloured by --mk-a and --mk-b so both themes
// work. The landing page and public/favicon.svg draw the same arcs.
export function BrandMark() {
  return (
    <svg className="brand-mark" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <g fill="none" strokeWidth="7">
        <path d="M35.74 14.39A18 18 0 0 1 49.12 37.56" stroke="var(--mk-a)" />
        <path d="M45.38 44.04A18 18 0 0 1 18.62 44.04" stroke="var(--mk-a)" />
        <path d="M14.88 37.56A18 18 0 0 1 28.26 14.39" stroke="var(--mk-b)" />
      </g>
    </svg>
  );
}
