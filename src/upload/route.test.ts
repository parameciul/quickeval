import { describe, expect, it } from 'vitest';
import { routeOf } from './route.ts';

const RESULT = 'abcdefghijkmnop2abcdefcd';
const UPLOAD = 'abcdefghijkmnop2';

describe('routeOf', () => {
  it('opens the result page at /u/result/<token>', () => {
    expect(routeOf(`/u/result/${RESULT}`)).toEqual({ kind: 'result', resultToken: RESULT });
  });

  it('opens the same result page at the first address /u/rezultat/<token>, which old tickets hold', () => {
    expect(routeOf(`/u/rezultat/${RESULT}`)).toEqual({ kind: 'result', resultToken: RESULT });
  });

  it('gives no result token for a wrong one on either address', () => {
    expect(routeOf('/u/result/short')).toEqual({ kind: 'result', resultToken: null });
    expect(routeOf('/u/rezultat/')).toEqual({ kind: 'result', resultToken: null });
    expect(routeOf(`/u/result/${UPLOAD}`)).toEqual({ kind: 'result', resultToken: null });
  });

  it('opens the upload page at /u/<token>', () => {
    expect(routeOf(`/u/${UPLOAD}`)).toEqual({ kind: 'upload', token: UPLOAD });
  });

  it('gives no upload token for a wrong one', () => {
    expect(routeOf('/u/')).toEqual({ kind: 'upload', token: null });
    expect(routeOf(`/u/${RESULT}`)).toEqual({ kind: 'upload', token: null });
  });
});
