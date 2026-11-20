import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import type { RobotStart, TestInfo, UploadRow } from '../../../shared/api.ts';
import { MAX_TITLE_LENGTH } from '../../../shared/tests.ts';
import { ActionsMenu, type MenuAction } from '../ActionsMenu.tsx';
import { useApi } from '../ApiContext.tsx';
import { ArchiveDialog, hasOpenResults } from '../ArchiveDialog.tsx';
import { RenameDialog } from '../classPage/ClassDialogs.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';
import { Modal } from '../Modal.tsx';
import { useRegradeAll } from './regradeAll.tsx';
import { remakes, robotReads, SubjectForm } from './SubjectForm.tsx';
import { t } from '../../i18n/t.ts';

// What "Schimbă materia" does, in the words under it.
function subjectHint(test: TestInfo): string {
  if (robotReads(test)) return t('Poți schimba materia după ce se termină corectarea.');
  if (test.subject === null) return t('Altfel, materia se stabilește la corectare, din test.');
  if (remakes(test)) return t('Lista de exerciții se face din nou, iar lucrările corectate se corectează din nou.');
  return t('Robotul corectează testul după materia aleasă.');
}

// "Acțiuni" of the test page (spec 2026-11-15 §1): the actions that work in
// every stage, at the top right of the page, each with what it does. Renaming
// and the subject open a dialog; the archive asks first while results are
// open; a delete asks with `window.confirm`.
export function TestMenu({
  test,
  uploads,
  onChanged,
  onRobot,
}: {
  test: TestInfo;
  uploads: UploadRow[];
  onChanged: () => Promise<void>;
  onRobot: (robot: RobotStart | null) => void;
}) {
  const api = useApi();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [dialog, setDialog] = useState<'rename' | 'subject' | 'archive' | null>(null);
  const remove = useMutation({
    mutationFn: () => api.deleteTest(test.code),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['tests'] });
      navigate('/');
    },
  });
  const archive = useMutation({
    mutationFn: (archived: boolean) => api.setTestArchived(test.code, archived),
    onSuccess: onChanged,
  });
  // A printed test keeps its QR code: after a delete, the code leads nowhere.
  const printed = test.print.status === 'ready';
  const subjectLabel = test.subject === null ? t('Alege materia') : t('Schimbă materia');
  const regrade = useRegradeAll({ code: test.code, testStatus: test.status, uploads, onChanged, onRobot });

  const actions: MenuAction[] = [
    { label: t('Redenumește testul'), hint: t('Schimbi titlul testului.'), icon: 'edit', busy: false, onChoose: () => setDialog('rename') },
    { label: subjectLabel, hint: subjectHint(test), icon: 'subject', busy: robotReads(test), onChoose: () => setDialog('subject') },
  ];
  if (regrade.action) actions.push(regrade.action);
  if (test.archived) {
    actions.push({
      label: t('Scoate din arhivă'),
      hint: t('Testul apare din nou în lista clasei și în Teste.'),
      icon: 'unarchive',
      busy: archive.isPending,
      onChoose: () => archive.mutate(false),
    });
  } else if (test.status === 'done') {
    actions.push({
      label: t('Arhivează testul'),
      hint: t('Testul nu mai apare în lista clasei și în Teste. Îl găsești cu „Arată și testele arhivate”.'),
      icon: 'archive',
      busy: archive.isPending,
      onChoose: () => (hasOpenResults(test) ? setDialog('archive') : archive.mutate(true)),
    });
  }
  actions.push({
    label: t('Șterge testul'),
    hint: t('Se șterg și toate lucrările încărcate de elevi.{v1}', { v1: printed ? ` ${t('Codurile QR de pe testele tipărite nu mai funcționează.')}` : '' }),
    icon: 'trash',
    danger: true,
    busy: remove.isPending,
    onChoose: () => {
      const qr = printed ? ` ${t('Codurile QR de pe testele tipărite nu vor mai funcționa.')}` : '';
      if (window.confirm(t('Ștergi testul {code}? Se șterg și toate lucrările încărcate.{qr}', { code: test.code, qr }))) remove.mutate();
    },
  });

  const close = () => setDialog(null);
  return (
    <div className="test-menu">
      <ActionsMenu label={t('Acțiuni')} menuId="test-actions-menu" actions={actions} />
      {regrade.notes}
      {archive.error && <ErrorMessage error={archive.error} />}
      {remove.error && <ErrorMessage error={remove.error} />}
      {dialog === 'rename' && (
        <RenameDialog
          title={t('Redenumește testul')}
          label={t('Titlu nou')}
          initial={test.title}
          maxLength={MAX_TITLE_LENGTH}
          save={(title) => api.renameTest(test.code, title)}
          onSaved={onChanged}
          onClose={close}
        />
      )}
      {dialog === 'subject' && (
        <Modal title={subjectLabel} onClose={close}>
          <div className="modal-body">
            <SubjectForm test={test} onDone={onChanged} onRobot={onRobot} onClose={close} />
          </div>
        </Modal>
      )}
      {dialog === 'archive' && (
        <ArchiveDialog
          title={t('Arhivezi testul?')}
          text={t('Elevii nu își vor mai putea vedea rezultatele. Le poți publica din nou oricând.')}
          onConfirm={() => archive.mutate(true)}
          onClose={close}
        />
      )}
    </div>
  );
}
