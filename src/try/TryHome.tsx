import { useQuery } from '@tanstack/react-query';
import type { QuickTryInfo } from '../../shared/api.ts';
import { useApi } from '../admin/ApiContext.tsx';
import { ErrorMessage } from '../admin/ErrorMessage.tsx';
import type { TryApi } from './api.ts';
import { Graded } from './Graded.tsx';
import { phaseOf, refreshOf } from './phase.ts';
import { Prepare } from './Prepare.tsx';
import { ShareButton } from './Share.tsx';
import { Expired, isExpired } from './TryNotice.tsx';
import { BaremProblem, Failed, Grading } from './Working.tsx';

// The try's page: the test read through the teacher app's client (the cache
// key of the test page and the review), and the part of the phase it is in.
export function TryHome({ info, token, tryApi }: { info: QuickTryInfo; token: string; tryApi: TryApi }) {
  const api = useApi();
  const detail = useQuery({
    queryKey: ['test', info.code],
    queryFn: () => api.getTest(info.code),
    refetchInterval: (query) => (query.state.error ? false : refreshOf(query.state.data)),
  });
  if (detail.isPending) return <p>Se încarcă…</p>;
  // Also after a first good read: the try's 7 days can end while the page is open.
  if (isExpired(detail.error)) return <Expired />;
  if (detail.data === undefined) return <ErrorMessage error={detail.error} />;
  const phase = phaseOf(detail.data);
  return (
    <section className="try-home">
      <div className="try-head">
        <div>
          <h1>Încercare rapidă</h1>
          <p className="test-sub">Corectezi o lucrare, fără cont. Linkul acestei pagini merge 7 zile.</p>
        </div>
        <ShareButton token={token} />
      </div>
      {phase === 'prepare' && <Prepare detail={detail.data} tryApi={tryApi} />}
      {phase === 'grading' && <Grading />}
      {phase === 'problem' && <BaremProblem detail={detail.data} />}
      {phase === 'failed' && <Failed detail={detail.data} />}
      {phase === 'graded' && (
        <>
          <Graded detail={detail.data} token={token} tryApi={tryApi} />
          <p className="try-invite">
            Îți place? <a href="/teacher/#cont-nou">Creează un cont: corectezi gratuit un test pentru toată clasa.</a>
          </p>
        </>
      )}
    </section>
  );
}
