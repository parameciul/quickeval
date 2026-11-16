import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import type { QuickTryInfo } from '../../shared/api.ts';
import { useApi } from '../admin/ApiContext.tsx';
import { ErrorMessage } from '../admin/ErrorMessage.tsx';
import { ApiError } from '../ui/ApiError.ts';
import { countLabel, formatFileSize } from '../ui/format.ts';
import { PagesUploader, type PagesApi } from '../upload/PagesUploader.tsx';
import type { TryApi } from './api.ts';
import { phaseOf } from './phase.ts';
import { Expired, isExpired } from './TryNotice.tsx';

// The phone page of a try (/try/<token>/telefon): the student's pages, sent
// like a student sends them, with no result and no link to the try's page.
// The laptop is in charge: "Am terminat" writes nothing on the server.
export function PhonePage({ info, tryApi }: { info: QuickTryInfo; tryApi: TryApi }) {
  const api = useApi();
  const queryClient = useQueryClient();
  const detail = useQuery({ queryKey: ['test', info.code], queryFn: () => api.getTest(info.code) });
  // Read when the page opens and after "Mai adaugă pagini" only: the uploader
  // holds the list in between, and a new read would start it anew.
  const pages = useQuery({ queryKey: ['try', 'pages'], queryFn: () => tryApi.listPages(), refetchOnWindowFocus: false });
  const [done, setDone] = useState<number | null>(null);
  const [round, setRound] = useState(0);
  // The server's word on a page refused because the grading started: the
  // read-only view keeps it.
  const [refused, setRefused] = useState<string | null>(null);

  const pagesApi = useMemo<PagesApi>(() => {
    // The grading started on the laptop meanwhile: the page turns read only,
    // with the pages read again and the server's word kept.
    const watchRefusal = async <T,>(call: () => Promise<T>): Promise<T> => {
      try {
        return await call();
      } catch (err) {
        if (err instanceof ApiError && err.code === 'paper_sent') {
          setRefused(err.message);
          void queryClient.invalidateQueries({ queryKey: ['try', 'pages'] });
          void queryClient.invalidateQueries({ queryKey: ['test', info.code] });
        }
        throw err;
      }
    };
    return {
      uploadFile: (file, name, onProgress) => watchRefusal(() => tryApi.uploadPage(file, name, onProgress)),
      deleteFile: (fileId) => watchRefusal(() => tryApi.deletePage(fileId)),
      fileBlob: (fileId) => tryApi.pageBlob(fileId),
    };
  }, [tryApi, queryClient, info.code]);

  if (detail.isPending || pages.isPending) return <p>Se încarcă…</p>;
  if (isExpired(detail.error)) return <Expired />;
  if (detail.data === undefined) return <ErrorMessage error={detail.error} />;
  if (pages.data === undefined) return <ErrorMessage error={pages.error} />;
  const title = detail.data.test.title;

  if (phaseOf(detail.data) !== 'prepare') {
    return (
      <section className="phone-page">
        <h1>Lucrarea elevului</h1>
        <p className="phone-title">{title}</p>
        {refused && <p className="hint">{refused}</p>}
        <p className="alert">Lucrarea a fost trimisă. Nu mai poți schimba paginile.</p>
        <h3>Paginile ({pages.data.length})</h3>
        <ol className="page-list">
          {pages.data.map((page) => (
            <li key={page.id} className="page-item is-sent">
              <span className="page-info">
                <span className="page-name">{page.name}</span>
                <span className="hint">{formatFileSize(page.size)}</span>
              </span>
            </li>
          ))}
        </ol>
      </section>
    );
  }

  if (done !== null) {
    return (
      <section className="phone-page phone-done">
        <span className="phone-tick" aria-hidden="true">
          ✓
        </span>
        <h1>Paginile au ajuns</h1>
        <p>
          {countLabel(done, 'pagină', 'pagini')} {done === 1 ? 'este' : 'sunt'} pe calculator.
        </p>
        <p>Continuă acolo.</p>
        <button
          type="button"
          className="button-quiet button-big"
          onClick={async () => {
            await pages.refetch();
            setRound((value) => value + 1);
            setDone(null);
          }}
        >
          Mai adaugă pagini
        </button>
      </section>
    );
  }

  return (
    <div className="phone-page">
      <PagesUploader
        key={round}
        pages={pagesApi}
        files={pages.data}
        heading={
          <>
            <h1>Lucrarea elevului</h1>
            <p className="phone-title">{title}</p>
          </>
        }
        listTitle="Paginile"
        finishLabel="Am terminat"
        onFinish={(count) => setDone(count)}
      />
    </div>
  );
}
