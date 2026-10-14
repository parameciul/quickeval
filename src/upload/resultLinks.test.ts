import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  forgetResultLinkByToken,
  loadResultLink,
  loadResultLinks,
  pruneStaleResultLinks,
  saveResultLink,
  singleUploadLocked,
} from './resultLinks.ts';

const TOKEN = 'abcdefghijkmnop2';

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('result links kept on the phone', () => {
  it('keeps one link per upload link and student', () => {
    saveResultLink(TOKEN, 10, 'rt-10', 'Pop Ion');
    expect(loadResultLink(TOKEN, 10)).toEqual({ studentId: 10, studentName: 'Pop Ion', resultToken: 'rt-10' });
    expect(loadResultLink(TOKEN, 11)).toBeNull();
    expect(loadResultLink('otherlinktoken22', 10)).toBeNull();
  });

  it('lists every link kept for one upload link', () => {
    saveResultLink(TOKEN, 11, 'rt-11', 'Pop Ion');
    saveResultLink(TOKEN, 10, 'rt-10', 'Ionescu Ana');
    saveResultLink('otherlinktoken22', 12, 'rt-12', 'Stan Eva');
    expect(loadResultLinks(TOKEN)).toEqual([
      { studentId: 10, studentName: 'Ionescu Ana', resultToken: 'rt-10' },
      { studentId: 11, studentName: 'Pop Ion', resultToken: 'rt-11' },
    ]);
    expect(loadResultLinks('nothinghere000000')).toEqual([]);
  });

  it('works without errors when the storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(() => saveResultLink(TOKEN, 10, 'rt', 'Pop Ion')).not.toThrow();
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(loadResultLink(TOKEN, 10)).toBeNull();
    expect(loadResultLinks(TOKEN)).toEqual([]);
  });

  it('forgets every kept link with a dead result token', () => {
    saveResultLink(TOKEN, 10, 'rt-dead', 'Pop Ion');
    saveResultLink(TOKEN, 11, 'rt-alive', 'Ionescu Ana');
    saveResultLink('otherlinktoken22', 12, 'rt-dead', 'Stan Eva');
    forgetResultLinkByToken('rt-dead');
    expect(loadResultLink(TOKEN, 10)).toBeNull();
    expect(loadResultLink(TOKEN, 11)).toEqual({ studentId: 11, studentName: 'Ionescu Ana', resultToken: 'rt-alive' });
    expect(loadResultLinks('otherlinktoken22')).toEqual([]);
  });

  it('keeps every link when the dead token is unknown, even with blocked storage', () => {
    saveResultLink(TOKEN, 10, 'rt-10', 'Pop Ion');
    expect(() => forgetResultLinkByToken('rt-missing')).not.toThrow();
    expect(loadResultLink(TOKEN, 10)).toEqual({ studentId: 10, studentName: 'Pop Ion', resultToken: 'rt-10' });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(() => forgetResultLinkByToken('rt-10')).not.toThrow();
  });

  it('locks the default link after one kept link', () => {
    expect(singleUploadLocked(TOKEN)).toBe(false);
    saveResultLink(TOKEN, 10, 'rt-10', 'Pop Ion');
    expect(singleUploadLocked(TOKEN)).toBe(true);
  });

  it('drops the kept links of uploads the teacher reset', () => {
    saveResultLink(TOKEN, 10, 'rt-10', 'Pop Ion');
    saveResultLink(TOKEN, 11, 'rt-11', 'Ionescu Ana');
    saveResultLink(TOKEN, 12, 'rt-12', 'Stan Eva');
    pruneStaleResultLinks(TOKEN, [
      { id: 10, name: 'Pop Ion', state: 'none' },
      { id: 11, name: 'Ionescu Ana', state: 'in_progress' },
      { id: 12, name: 'Stan Eva', state: 'done' },
    ]);
    // The reset uploads unlock; the sent one still locks. A student who left
    // the class is not in the list, so their link stays.
    expect(loadResultLinks(TOKEN)).toEqual([{ studentId: 12, studentName: 'Stan Eva', resultToken: 'rt-12' }]);
    expect(singleUploadLocked(TOKEN)).toBe(true);
    pruneStaleResultLinks(TOKEN, [{ id: 12, name: 'Stan Eva', state: 'none' }]);
    expect(loadResultLinks(TOKEN)).toEqual([]);
    expect(singleUploadLocked(TOKEN)).toBe(false);
  });
});
