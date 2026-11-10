import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import type { QuickTryInfo, TestDetail } from '../../shared/api.ts';
import type { TestFileKind } from '../../shared/files.ts';
import { QUICK_TRY_TITLE } from '../../shared/quickTry.ts';
import { MAX_TITLE_LENGTH } from '../../shared/tests.ts';
import { testFileUrl } from '../admin/api.ts';
import { useApi } from '../admin/ApiContext.tsx';
import { ErrorMessage } from '../admin/ErrorMessage.tsx';
import { formatDate, formatDateTime } from '../ui/format.ts';
import { paperOf, phaseOf } from './phase.ts';
import { ShareButton } from './Share.tsx';

// The head of the try's page, the same in every state and view: the try's
// name (which she may change), when it was sent, until when its link works,
// the test and barem it uses (not while she prepares them: that part of the
// page has them), and "Distribuie".
export function TryHead({ detail, info, token }: { detail: TestDetail; info: QuickTryInfo; token: string }) {
  const { test } = detail;
  const paper = paperOf(detail);
  const sent = paper?.submittedAt ? `Trimisă la corectare ${formatDateTime(paper.submittedAt)} · ` : paper?.startedAt ? `Începută ${formatDateTime(paper.startedAt)} · ` : '';
  return (
    <header className="try-head">
      <div className="try-head-main">
        {test.title !== QUICK_TRY_TITLE && <p className="try-kicker">{QUICK_TRY_TITLE}</p>}
        <TryTitle code={test.code} title={test.title} />
        <p className="try-meta">
          {sent}Linkul merge până pe {formatDate(info.expiresAt)}
        </p>
        {phaseOf(detail) !== 'prepare' && (
          <div className="try-files">
            {test.files.test && <FileLink code={test.code} kind="test" label="Testul" name="Descarcă testul" />}
            {test.files.barem && <FileLink code={test.code} kind="barem" label="Baremul" name="Descarcă baremul" />}
          </div>
        )}
      </div>
      <ShareButton token={token} />
    </header>
  );
}

function FileLink({ code, kind, label, name }: { code: string; kind: TestFileKind; label: string; name: string }) {
  const api = useApi();
  return (
    <a className="try-file" href={testFileUrl(code, kind, undefined, api.base)} target="_blank" rel="noopener" aria-label={name}>
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M10 3v10M5.5 8.5 10 13l4.5-4.5M4 16.5h12" />
      </svg>
      {label}
    </a>
  );
}

// The try's name as the page's title, and the form that changes it.
function TryTitle({ code, title }: { code: string; title: string }) {
  const api = useApi();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<string | null>(null);
  const rename = useMutation({
    mutationFn: (next: string) => api.renameTest(code, next),
    onSuccess: async () => {
      setDraft(null);
      await queryClient.invalidateQueries({ queryKey: ['test', code] });
    },
  });
  if (draft === null) {
    return (
      <div className="try-title">
        <h1>{title}</h1>
        <button type="button" className="try-title-edit" aria-label="Schimbă numele" title="Schimbă numele" onClick={() => setDraft(title)}>
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true">
            <path d="M13.5 3.5l3 3-9 9H4.5v-3z" />
          </svg>
        </button>
      </div>
    );
  }
  const save = (event: FormEvent) => {
    event.preventDefault();
    rename.mutate(draft);
  };
  return (
    <form className="try-rename" aria-label="Schimbă numele" onSubmit={save}>
      <label className="sr-only" htmlFor="try-name">
        Numele testului
      </label>
      <input
        id="try-name"
        type="text"
        value={draft}
        maxLength={MAX_TITLE_LENGTH}
        autoFocus
        onChange={(event) => setDraft(event.target.value)}
      />
      <div className="try-rename-actions">
        <button type="submit" className="button" disabled={rename.isPending}>
          Salvează
        </button>
        <button
          type="button"
          className="button-quiet"
          onClick={() => {
            rename.reset();
            setDraft(null);
          }}
        >
          Renunță
        </button>
      </div>
      {rename.error && <ErrorMessage error={rename.error} />}
    </form>
  );
}
