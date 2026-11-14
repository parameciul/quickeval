import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useLocation, useParams } from 'react-router';
import type { RobotStart, TestDetail } from '../../../shared/api.ts';
import { displayClassName } from '../../../shared/classes.ts';
import { normalizeTestCode } from '../../../shared/tests.ts';
import { formatDateTime, robotStartMessage, studentCountLabel } from '../../ui/format.ts';
import { useApi } from '../ApiContext.tsx';
import { Crumbs } from '../Crumbs.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';
import { stageFromHash, stagesOf, type StageName } from '../stages.ts';
import { StageList } from '../testPage/StageList.tsx';
import { StagePanel } from '../testPage/StagePanel.tsx';
import { waitsForBarem, waitsForPrint } from '../testPage/StartRobotButton.tsx';
import { TestSheet } from '../testPage/TestSheet.tsx';
import { NotFoundPage } from './NotFoundPage.tsx';

export function TestPage() {
  const code = normalizeTestCode(useParams().code ?? '');
  if (code === null) return <NotFoundPage />;
  return <TestDetails key={code} code={code} />;
}

function TestDetails({ code }: { code: string }) {
  const api = useApi();
  const detail = useQuery({
    queryKey: ['test', code],
    queryFn: () => api.getTest(code),
  });

  if (detail.isPending) return <p>Se încarcă…</p>;
  // A failed first load has nothing to show. A failed refresh keeps the page,
  // and an open QR view with it, and says why above it.
  if (detail.data === undefined) return <ErrorMessage error={detail.error} />;
  return (
    <TestView
      code={code}
      detail={detail.data}
      fresh={detail.isFetchedAfterMount}
      refreshError={detail.isRefetchError ? detail.error : null}
    />
  );
}

// The test page of the redesign (spec §6): the six stages and Fișa testului,
// and the panel of the chosen stage. `fresh`: the data was read for this
// visit, not kept from an earlier one.
function TestView({ code, detail, fresh, refreshError }: { code: string; detail: TestDetail; fresh: boolean; refreshError: Error | null }) {
  const queryClient = useQueryClient();
  const location = useLocation();
  // The notice of the page before stays while the teacher opens other stages,
  // whose links replace the navigation state.
  const [notice] = useState(() => (location.state as { notice?: string } | null)?.notice);
  // When the robot starts, after the teacher started or restarted grading.
  const [robotNotice, setRobotNotice] = useState<string | null>(null);
  const onRobot = (robot: RobotStart | null) => setRobotNotice(robot ? robotStartMessage(robot) : null);
  // The uploads to grade at the next Start evaluation (submission ids).
  // Empty at first, so the start button stays off until the teacher selects.
  const [selected, setSelected] = useState<number[]>([]);
  const { test, uploads, robot, showModel } = detail;
  const { stages, current } = stagesOf(test);
  // The page opens on the stage the test is at when it first loads. Data kept
  // from an earlier visit can be old, so only data read for this visit fixes
  // that stage. After that only the teacher changes the panel: a refresh or a
  // button that moves the test on keeps it.
  const [opened, setOpened] = useState<StageName | null>(fresh ? current.name : null);
  if (opened === null && fresh) setOpened(current.name);
  const chosen = stageFromHash(location.hash) ?? opened ?? current.name;

  // The list of the year is read on every page (the shell): read it again,
  // but do not wait for it.
  const refresh = async () => {
    void queryClient.invalidateQueries({ queryKey: ['tests'] });
    await queryClient.invalidateQueries({ queryKey: ['test', code] });
  };

  // A failed robot start that the API kept: a scheduled start happens in any
  // request, so only the API knows of it. A button's answer says the same.
  // A draft or open test waits for the robot only for its print PDF or its barem.
  const robotWork = test.status === 'evaluating' || waitsForPrint(test) || waitsForBarem(test);
  const robotText = robotWork && robot.startFailed ? robotStartMessage('next_check') : robotNotice;

  return (
    <section className="test-page">
      <Crumbs items={[{ label: 'Teste', to: '/' }, { label: displayClassName(test.className), to: `/clase/${test.classId}` }, { label: test.title }]} />
      <div className="test-head">
        <h1>{test.title}</h1>
        <p className="test-sub">
          {studentCountLabel(test.studentCount)} · {test.startedAt ? `început ${formatDateTime(test.startedAt)}` : 'ciornă'}
        </p>
      </div>
      {refreshError && <ErrorMessage error={refreshError} />}
      {notice && (
        <p className="alert" role="alert">
          {notice}
        </p>
      )}
      {robotText && <p role="status">{robotText}</p>}
      <div className="test-grid">
        <StageList stages={stages} chosen={chosen} />
        <StagePanel
          stage={chosen}
          test={test}
          uploads={uploads}
          robot={robot}
          showModel={showModel}
          selected={selected}
          onSelect={setSelected}
          onChanged={refresh}
          onRobot={onRobot}
        />
        <TestSheet test={test} onChanged={refresh} onRobot={onRobot} />
      </div>
    </section>
  );
}
