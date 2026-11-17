import { useMemo } from 'react';
import type { ActiveSession, UploadApi } from './api.ts';
import { PagesUploader, type PagesApi } from './PagesUploader.tsx';
import { forgetSecret } from './session.ts';
import { shrinkPhoto } from './shrink.ts';

// The student's upload screen: the shared pages uploader, with the student's
// name and "Am trimis tot", which confirms the upload after a question.
export function UploadScreen({
  api,
  token,
  session,
  onSent,
  onLost,
  shrink = shrinkPhoto,
}: {
  api: UploadApi;
  token: string;
  session: ActiveSession;
  onSent: (fileCount: number, resultToken: string) => void;
  onLost: (message: string) => void;
  shrink?: (file: File) => Promise<Blob>;
}) {
  const pages = useMemo<PagesApi>(
    () => ({
      uploadFile: (file, name, onProgress) => api.uploadFile(token, session.secret, file, name, onProgress),
      deleteFile: (fileId) => api.deleteFile(token, session.secret, fileId),
      fileBlob: (fileId) => api.fileBlob(token, session.secret, fileId),
    }),
    [api, token, session.secret],
  );

  const confirm = async () => {
    if (!window.confirm('Ești sigur? După confirmare nu mai poți schimba nimic.')) return;
    const { fileCount, resultToken } = await api.confirm(token, session.secret);
    forgetSecret(token, session.studentId);
    onSent(fileCount, resultToken);
  };

  return (
    <PagesUploader
      pages={pages}
      files={session.files}
      heading={<h2>{session.studentName}</h2>}
      listTitle="Paginile tale"
      finishLabel="Am trimis tot"
      onFinish={confirm}
      onLost={onLost}
      shrink={shrink}
    />
  );
}
