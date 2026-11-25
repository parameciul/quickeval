import { afterEach, describe, expect, it, vi } from 'vitest';
import { forgetAccountState, goToSettings, rememberViewedName, takeEndedName, viewPartOf, viewTab } from './viewing.ts';

afterEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('viewPartOf', () => {
  it('is the fourth part of the version, or empty', () => {
    expect(viewPartOf('3||')).toBe('');
    expect(viewPartOf('3|||v12')).toBe('v12');
    expect(viewPartOf('{"tests":[]}')).toBe('');
  });
});

describe('the account state', () => {
  it('forgets the last class', () => {
    localStorage.setItem('quickeval:lastClass', '4');
    forgetAccountState();
    expect(localStorage.getItem('quickeval:lastClass')).toBeNull();
  });

  it('goes to Setări and tells it the view ended, once', () => {
    const leave = vi.spyOn(viewTab, 'leave').mockImplementation(() => {});
    localStorage.setItem('quickeval:lastClass', '4');
    rememberViewedName('Ana Pop');
    goToSettings(true);
    expect(leave).toHaveBeenCalledWith('/teacher/settings');
    expect(localStorage.getItem('quickeval:lastClass')).toBeNull();
    expect(takeEndedName()).toBe('Ana Pop');
    expect(takeEndedName()).toBeNull();
  });

  it('leaves no notice when the administrator exits', () => {
    vi.spyOn(viewTab, 'leave').mockImplementation(() => {});
    rememberViewedName('Ana Pop');
    goToSettings(false);
    expect(takeEndedName()).toBeNull();
  });
});
