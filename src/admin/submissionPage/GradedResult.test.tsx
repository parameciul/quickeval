import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import type { EvaluationInfo, SubmissionDetail } from '../../../shared/api.ts';
import { createFakeApi, fakeEvaluation, fakeItem, fakeSubmission } from '../../test/fakeApi.ts';
import { ApiProvider } from '../ApiContext.tsx';
import { GradedResult } from './GradedResult.tsx';

// The plain result, without the paper page's hold on its rows. A row to check
// keeps its reason and "Verificat".
const GRADED_AT = '2026-10-07T09:00:00.000Z';

function paper(): SubmissionDetail {
  return fakeSubmission({
    id: 5,
    evaluation: fakeEvaluation(
      [
        fakeItem({ id: 31, exerciseId: 'I.1', label: 'Subiectul I, ex. 1', points: 4.5 }),
        fakeItem({ id: 32, exerciseId: 'II.1', label: 'Subiectul II, ex. 1', points: 1, needsReview: true, reviewReason: 'Scrisul nu se citește.' }),
      ],
      { unreadable: ['student/page-02.jpg'] },
    ),
  });
}

function Holder({ initial }: { initial: EvaluationInfo }) {
  const [evaluation, setEvaluation] = useState(initial);
  return <GradedResult submissionId={5} evaluation={evaluation} onSaved={async (saved) => setEvaluation(saved.evaluation!)} />;
}

function renderPlain() {
  const submission = paper();
  const api = createFakeApi({ classes: [], students: {}, tests: [], submissions: [structuredClone(submission)] });
  render(
    <ApiProvider api={api}>
      <QueryClientProvider client={new QueryClient()}>
        <Holder initial={submission.evaluation!} />
      </QueryClientProvider>
    </ApiProvider>,
  );
  return api;
}

const row = (label: string) => screen.getByRole('row', { name: new RegExp(label) });

describe('GradedResult without the paper page', () => {
  it('puts Verificat in the note with its reason, and checks the item', async () => {
    const api = renderPlain();
    const flagged = row('Subiectul II, ex. 1');
    expect(flagged).toHaveClass('is-flagged');
    const check = within(flagged).getByRole('button', { name: 'Verificat Subiectul II, ex. 1' });
    expect(within(check.closest('.review-note') as HTMLElement).getByText('De verificat: Scrisul nu se citește.')).toBeInTheDocument();
    expect(within(flagged).queryByRole('button', { name: /^Verifică/ })).not.toBeInTheDocument();
    expect(within(flagged).queryByRole('button', { name: /^Arată pe lucrare/ })).not.toBeInTheDocument();
    await userEvent.click(check);
    expect(api.correctItem).toHaveBeenCalledWith(5, 32, { gradedAt: GRADED_AT, reviewed: true });
    expect(await within(row('Subiectul II, ex. 1')).findByText('Verificat')).toBeInTheDocument();
    expect(row('Subiectul II, ex. 1')).not.toHaveClass('is-flagged');
  });

  it('names the pages the robot could not read, with "Am verificat paginile"', async () => {
    const api = renderPlain();
    expect(screen.getByText('Robotul nu a putut citi: Pagina 2. Verifică pozele și punctajele exercițiilor de pe ele.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Am verificat paginile' }));
    expect(api.reviewPages).toHaveBeenCalledWith(5, { gradedAt: GRADED_AT, pagesReviewed: true });
    expect(await screen.findByText('Robotul nu a putut citi: Pagina 2. Ai verificat aceste pagini.')).toBeInTheDocument();
  });

  it('never makes the points bold', async () => {
    renderPlain();
    expect(within(row('Subiectul I, ex. 1')).getByText('4,5 din 4,5')).toHaveClass('points', 'points-5');
  });
});
