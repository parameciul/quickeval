import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { StudentResultView } from '../../shared/api.ts';
import { StudentResult } from './StudentResult.tsx';

const result: StudentResultView = {
  testCode: 'PROBA-26T1',
  testTitle: 'Încercare rapidă',
  className: 'PROBA',
  studentName: 'Elev',
  status: 'graded',
  files: [{ id: 21, name: 'IMG_0001.jpg', contentType: 'image/jpeg', size: 1024, position: 1 }],
  evaluation: null,
};

describe('StudentResult', () => {
  it('opens the pages at the addresses its page gives', async () => {
    render(<StudentResult result={result} fileUrl={(fileId) => `/api/try/abc/paper/${fileId}`} />);
    await userEvent.click(screen.getByRole('button', { name: 'Arată fișierele' }));
    expect(screen.getByRole('img', { name: 'Pagina 1' })).toHaveAttribute('src', '/api/try/abc/paper/21');
  });
});
