import { Modal } from './Modal.tsx';

// What a test's or a class's archive would close: the result pages students
// can open now (for all, or for some students).
export function hasOpenResults(test: { resultsOpen: boolean; publishedCount: number }): boolean {
  return test.resultsOpen || test.publishedCount > 0;
}

// Asks before an archive that closes result pages students can open now.
// "Arhivează" closes the dialog and archives; "Renunță", Esc, × and the
// backdrop change nothing.
export function ArchiveDialog({ title, text, onConfirm, onClose }: { title: string; text: string; onConfirm(): void; onClose(): void }) {
  return (
    <Modal title={title} onClose={onClose}>
      <div className="modal-body">
        <p className="modal-text">{text}</p>
        <div className="modal-actions">
          <button type="button" className="button-quiet" onClick={onClose}>
            Renunță
          </button>
          <button
            type="button"
            className="button"
            onClick={() => {
              onClose();
              onConfirm();
            }}
          >
            Arhivează
          </button>
        </div>
      </div>
    </Modal>
  );
}
