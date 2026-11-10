import type { QuickTryInfo } from '../../shared/api.ts';
import type { TryApi } from './api.ts';

// The try's page: its states come in the next tasks.
export function TryHome({ info }: { info: QuickTryInfo; tryApi: TryApi }) {
  return (
    <section>
      <h1>Încercare rapidă</h1>
      <p className="hint">{info.code}</p>
    </section>
  );
}
