import { useEffect, useId, useRef, useState, type RefObject } from 'react';
import { t } from '../i18n/t.ts';

// Copies a link. When the browser refuses, `refused` turns on and the field
// of `CopyRefused` gets the focus with the link selected, to copy by hand.
export function useCopyLink() {
  const [copied, setCopied] = useState(false);
  const [refused, setRefused] = useState(false);
  const field = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!refused) return;
    field.current?.focus();
    field.current?.select();
  }, [refused]);
  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setRefused(true);
    }
  };
  // Back to the start, when what showed the result of a copy closes.
  const reset = () => {
    setCopied(false);
    setRefused(false);
  };
  return { copied, refused, copy, reset, field };
}

// The link in a field, after a refused copy; the line above it says why the
// field is there, also to a screen reader (its description).
export function CopyRefused({ field, url, label }: { field: RefObject<HTMLInputElement | null>; url: string; label: string }) {
  const hintId = useId();
  return (
    <span className="result-share-box">
      <span className="hint" id={hintId}>
        {t('Nu am putut copia linkul. Copiază-l de aici.')}
      </span>
      <input
        ref={field}
        type="text"
        readOnly
        value={url}
        aria-label={label}
        aria-describedby={hintId}
        onFocus={(event) => event.target.select()}
      />
    </span>
  );
}
