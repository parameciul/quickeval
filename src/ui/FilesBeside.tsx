import { useEffect, useRef, useState, type ReactNode } from 'react';

// A paper's pages beside its result: the teacher's page of a paper, a Quick
// Try's two results and the student's result. A strip with the count and one
// button stands first, above the result. The files start hidden, leaving the
// full width to the result. Shown, on a wide screen they stand left of the
// result and stay in view while it scrolls; opening them always starts the
// list at the top. `files` is the list itself: each page builds its own file
// links.
export function FilesBeside({ count, files, children }: { count: number; files: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const scroll = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (open && scroll.current) scroll.current.scrollTop = 0;
  }, [open]);
  return (
    <div className={open ? 'result-layout' : 'result-layout is-collapsed'}>
      <div className={open ? 'result-files' : 'result-files is-collapsed'}>
        <div className="files-head">
          <h2>Fișiere ({count})</h2>
          <button type="button" className="button-quiet button-small" aria-expanded={open} onClick={() => setOpen(!open)}>
            {open ? 'Ascunde fișierele' : 'Arată fișierele'}
          </button>
        </div>
        {open && (
          <div className="result-files-scroll" ref={scroll}>
            {files}
          </div>
        )}
      </div>
      <div className="result-main">{children}</div>
    </div>
  );
}
