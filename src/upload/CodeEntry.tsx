import { useId, useRef, useState, type FormEvent } from 'react';
import type { ResultCodeAnswer } from '../../shared/api.ts';
import { normalizeResultCode, RESULT_CODE_LENGTH } from '../../shared/tests.ts';
import { ActionIcon } from '../ui/ActionIcon.tsx';
import { messageOf } from '../ui/ApiError.ts';
import type { UploadApi } from './api.ts';

// The code as the field shows it while the student types: capitals, only
// letters and digits, a dash after the third. What is not in the codes'
// alphabet stays, so the student sees what was typed; the field refuses it.
export function typedCode(raw: string): string {
  const plain = raw
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, RESULT_CODE_LENGTH);
  return plain.length > 3 ? `${plain.slice(0, 3)}-${plain.slice(3)}` : plain;
}

// "Scrie codul tău": the way back to a result for a student whose phone has
// no link (another phone, a cleared browser). The code is the short one on
// the ticket; it works only here, on the test's own page. Under the field,
// where to look for a code that is not at hand.
export function CodeEntry({
  api,
  token,
  onOpened,
}: {
  api: UploadApi;
  token: string;
  // The result link the code opened.
  onOpened: (answer: ResultCodeAnswer) => void;
}) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A second tap can come before the disabled button is drawn.
  const working = useRef(false);
  const fieldId = useId();
  const errorId = useId();

  async function open(event: FormEvent) {
    event.preventDefault();
    if (working.current) return;
    if (code === '') {
      setError('Scrie codul de pe biletul tău.');
      return;
    }
    // Every text sent costs one of the test's shared tries, so a text that
    // can never be a code is refused here and costs none.
    if (normalizeResultCode(code) === null) {
      setError('Codul are 6 caractere, fără 0, O, 1, I sau L. Verifică biletul.');
      return;
    }
    working.current = true;
    setBusy(true);
    setError(null);
    try {
      onOpened(await api.openByCode(token, code));
    } catch (err) {
      setError(messageOf(err));
    } finally {
      working.current = false;
      setBusy(false);
    }
  }

  return (
    <section className="code-entry" aria-label="Deschide rezultatul cu codul">
      <form className="code-form" onSubmit={(event) => void open(event)} noValidate>
        <label htmlFor={fieldId}>Scrie codul tău</label>
        <input
          id={fieldId}
          type="text"
          className="code-input"
          value={code}
          onChange={(event) => {
            setCode(typedCode(event.target.value));
            setError(null);
          }}
          placeholder="ABC-234"
          autoCapitalize="characters"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          maxLength={RESULT_CODE_LENGTH + 4}
          aria-invalid={error !== null}
          aria-describedby={error !== null ? errorId : undefined}
        />
        <button type="submit" className="button button-big" disabled={busy}>
          <ActionIcon name="eye" />
          Vezi rezultatul
        </button>
        {error !== null && (
          <p id={errorId} className="alert" role="alert">
            {error}
          </p>
        )}
      </form>
      <div className="code-where">
        <p>Nu știi codul?</p>
        <ul>
          <li>Caută în poze biletul cu codul QR.</li>
          <li>Caută în mesaje linkul pe care ți l-ai trimis.</li>
          <li>Deschide linkul testului pe telefonul cu care ai trimis lucrarea.</li>
          <li>Dacă nu găsești nimic, cere profesorului codul tău.</li>
        </ul>
      </div>
    </section>
  );
}
