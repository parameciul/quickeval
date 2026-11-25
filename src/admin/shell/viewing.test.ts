import { afterEach, describe, expect, it, vi } from 'vitest';
import { beginExit, reloadOnRestore, forgetAccountState, goToSettings, isLeaving, rememberViewedName, takeEndedName, viewPartOf, viewTab } from './viewing.ts';

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

describe('leaving', () => {
  it('goes to Setări once; a second call does nothing', () => {
    const leave = vi.spyOn(viewTab, 'leave').mockImplementation(() => {});
    rememberViewedName('Ana Pop');
    goToSettings(true);
    goToSettings(true);
    expect(leave).toHaveBeenCalledTimes(1);
    expect(isLeaving()).toBe(true);
  });

  it('is marked by viewTab.leave itself', () => {
    const assign = vi.spyOn(viewTab, 'assign').mockImplementation(() => {});
    expect(isLeaving()).toBe(false);
    viewTab.leave('/teacher/');
    expect(assign).toHaveBeenCalledWith('/teacher/');
    expect(isLeaving()).toBe(true);
  });

  it('takes an end that lands during a deliberate exit as no notice', () => {
    const leave = vi.spyOn(viewTab, 'leave').mockImplementation(() => {});
    rememberViewedName('Ana Pop');
    beginExit();
    goToSettings(true);
    expect(leave).toHaveBeenCalledTimes(1);
    expect(takeEndedName()).toBeNull();
  });
});

describe('reloadOnRestore', () => {
  const show = (persisted: boolean) => {
    const event = new Event('pageshow') as PageTransitionEvent;
    Object.defineProperty(event, 'persisted', { value: persisted });
    window.dispatchEvent(event);
  };

  it('loads the page again when the browser restores it from its cache, and only then', () => {
    const reload = vi.spyOn(viewTab, 'reload').mockImplementation(() => {});
    const stop = reloadOnRestore();
    show(false);
    expect(reload).not.toHaveBeenCalled();
    show(true);
    expect(reload).toHaveBeenCalledTimes(1);
    stop();
    show(true);
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
