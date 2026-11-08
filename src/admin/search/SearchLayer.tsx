import { useEffect, useRef } from 'react';
import { IconBack } from '../shell/icons.tsx';
import { useFocusBack } from '../shell/useFocusBack.ts';
import { SearchBox } from './SearchBox.tsx';

// On a phone the magnifier beside ☰ opens the search over the whole screen
// (redesign spec §11.10): ← and Esc close it, and so does a new page (the
// Layout). The focus then goes back to the magnifier.
export function SearchLayer({ onClose }: { onClose(): void }) {
  const box = useRef<HTMLDivElement>(null);
  useFocusBack(box);
  // After useFocusBack noted the magnifier: the box is ready for typing.
  useEffect(() => box.current?.querySelector('input')?.focus(), []);
  return (
    <div ref={box} className="search-full" id="search-full" role="dialog" aria-modal="true" aria-label="Caută">
      <div className="search-full-head">
        <button type="button" className="search-back" aria-label="Închide căutarea" onClick={onClose}>
          <IconBack />
        </button>
        <SearchBox id="search-phone" always />
      </div>
    </div>
  );
}
