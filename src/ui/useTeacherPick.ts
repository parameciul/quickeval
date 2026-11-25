import { useCallback, useEffect, useRef, useState } from 'react';
import { t } from '../i18n/t.ts';
import { checkPick, picturesToPdf, type MakePdf } from './picturesPdf.ts';

// What a pick of the test or the barem ends in: the file to send (photos made
// into one PDF; `pictures` counts them, 0 for a PDF or Word file), why it
// cannot be sent, or no file (nothing picked, or the teacher said no).
export type PickOutcome = { file: File; pictures: number } | { problem: string } | { file: null };

// Takes the files a teacher picked or dropped for the test or the barem. One
// PDF or Word file ends at once, as before; photos end when their PDF is made,
// with `busy` true meanwhile. A pick made while photos are being prepared
// wins: the older one's PDF is dropped, and so is one that ends after the
// picker is gone. `confirm` gets the name of the file that would be sent.
export function useTeacherPick(makePdf: MakePdf = picturesToPdf) {
  const [busy, setBusy] = useState(false);
  const round = useRef(0);
  useEffect(
    () => () => {
      round.current += 1;
    },
    [],
  );

  const take = useCallback(
    (files: readonly File[], done: (outcome: PickOutcome) => void, confirm?: (name: string) => boolean) => {
      round.current += 1;
      const mine = round.current;
      setBusy(false);
      const check = checkPick(files);
      if (!check) return done({ file: null });
      if (check.kind === 'problem') return done({ problem: check.problem });
      if (confirm && !confirm(check.kind === 'document' ? check.file.name : check.name)) return done({ file: null });
      if (check.kind === 'document') return done({ file: check.file, pictures: 0 });
      setBusy(true);
      void makePdf(check.pictures, check.name)
        .catch(() => ({ problem: t('A apărut o eroare. Încearcă din nou.') }))
        .then((result) => {
          if (round.current !== mine) return;
          setBusy(false);
          done('file' in result ? { file: result.file, pictures: check.pictures.length } : { problem: result.problem });
        });
    },
    [makePdf],
  );

  return { take, busy };
}
