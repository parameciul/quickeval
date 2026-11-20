// The English text of every page, keyed by the Romanian text. One file per
// area; a key in two files must have the same English.
import { ADMIN } from './admin.ts';
import { LANDING } from './landing.ts';
import { TRY } from './try.ts';
import { UI } from './ui.ts';
import { UPLOAD } from './upload.ts';

export const EN = {
  ...UI,
  ...UPLOAD,
  ...TRY,
  ...LANDING,
  ...ADMIN,
} as const;
