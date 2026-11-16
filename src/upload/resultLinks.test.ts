import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  forgetResultLinkByToken,
  loadResultLink,
  loadResultLinks,
  loadTestResultLinks,
  pruneStaleResultLinks,
  rememberTestKey,
  saveResultLink,
  singleUploadLocked,
  tokensToAsk,
  UNKNOWN_TEST_KEY,
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

  it('lists the links kept through any link of the same test, once each', () => {
    const multi = 'multilinktoken22';
    saveResultLink(TOKEN, 11, 'rt-11', 'Pop Ion');
    saveResultLink(multi, 10, 'rt-10', 'Ionescu Ana');
    // The same paper kept through both links shows once.
    saveResultLink(multi, 11, 'rt-11', 'Pop Ion');
    saveResultLink('otherlinktoken22', 12, 'rt-12', 'Stan Eva');
    saveResultLink('deadlinktoken222', 13, 'rt-13', 'Dan Ilie');
    rememberTestKey(TOKEN, 'key-a');
    // Not remembered yet: the other link's papers are not this test's.
    expect(loadTestResultLinks(TOKEN, 'key-a')).toEqual([{ studentId: 11, studentName: 'Pop Ion', resultToken: 'rt-11' }]);
    rememberTestKey(multi, 'key-a');
    rememberTestKey('otherlinktoken22', 'key-b');
    rememberTestKey('deadlinktoken222', UNKNOWN_TEST_KEY);
    expect(loadTestResultLinks(TOKEN, 'key-a')).toEqual([
      { studentId: 10, studentName: 'Ionescu Ana', resultToken: 'rt-10' },
      { studentId: 11, studentName: 'Pop Ion', resultToken: 'rt-11' },
    ]);
    // A link the server does not know never matches, whatever key is asked.
    expect(loadTestResultLinks(TOKEN, UNKNOWN_TEST_KEY)).toEqual([{ studentId: 11, studentName: 'Pop Ion', resultToken: 'rt-11' }]);
  });

  it('names the other links with a kept result and no remembered test, at most 5', () => {
    expect(tokensToAsk(TOKEN)).toEqual([]);
    saveResultLink(TOKEN, 11, 'rt-11', 'Pop Ion');
    saveResultLink('multilinktoken22', 10, 'rt-10', 'Ionescu Ana');
    saveResultLink('multilinktoken22', 12, 'rt-12', 'Stan Eva');
    saveResultLink('otherlinktoken22', 12, 'rt-12b', 'Stan Eva');
    saveResultLink('deadlinktoken222', 13, 'rt-13', 'Dan Ilie');
    expect(tokensToAsk(TOKEN)).toEqual(['deadlinktoken222', 'multilinktoken22', 'otherlinktoken22']);
    rememberTestKey('multilinktoken22', 'key-a');
    rememberTestKey('deadlinktoken222', UNKNOWN_TEST_KEY);
    expect(tokensToAsk(TOKEN)).toEqual(['otherlinktoken22']);
    for (const letter of 'abcdefgh') saveResultLink(`manylinktoken2${letter}`, 20, `rt-${letter}`, 'Pop Ion');
    expect(tokensToAsk(TOKEN)).toHaveLength(5);
  });

  it('finds no other link when the storage is blocked', () => {
    saveResultLink('multilinktoken22', 10, 'rt-10', 'Ionescu Ana');
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(() => rememberTestKey(TOKEN, 'key-a')).not.toThrow();
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'key').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(tokensToAsk(TOKEN)).toEqual([]);
    expect(loadTestResultLinks(TOKEN, 'key-a')).toEqual([]);
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
