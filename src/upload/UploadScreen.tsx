import type { ActiveSession, UploadApi } from './api.ts';

// The upload screen. Task 12 of Plan 2 replaces this first version with the
// photo and file upload.
export function UploadScreen({
  session,
}: {
  api: UploadApi;
  token: string;
  session: ActiveSession;
  onSent: (fileCount: number) => void;
  onLost: (message: string) => void;
}) {
  return (
    <section>
      <h2>{session.studentName}</h2>
      <p>Fișiere încărcate: {session.files.length}</p>
    </section>
  );
}
