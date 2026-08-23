/**
 * [G1] Unit spec for the View flow's pure decisions (DESIGN.md "Revision
 * History & Restore"): the confirm gate fires only for actual unsaved
 * edits, and the header chip is version-aware while a viewed revision
 * sits untouched in the buffer.
 */
import { describe, expect, it } from 'vitest';

import { chipFor, viewGateFor, type ViewBuffer } from './view-buffer';

function buffer(partial: Partial<ViewBuffer>): ViewBuffer {
  return {
    unitId: 'u1',
    base: 'latest',
    working: 'latest',
    viewedVersion: null,
    ...partial,
  };
}

describe('[G1] view-buffer', () => {
  it('viewGateFor: clean buffer seats', () => {
    expect(viewGateFor(buffer({}), 'latest')).toBe('seat');
  });

  it('viewGateFor: unsaved edits confirm', () => {
    expect(viewGateFor(buffer({ working: 'edited' }), 'latest')).toBe(
      'confirm',
    );
  });

  it('viewGateFor: untouched viewed revision seats', () => {
    expect(
      viewGateFor(buffer({ working: 'old', viewedVersion: 2 }), 'latest'),
    ).toBe('seat');
  });

  it('viewGateFor: working already equal to latest seats', () => {
    expect(viewGateFor(buffer({ base: 'stale' }), 'latest')).toBe('seat');
  });

  it('chipFor: clean buffer shows nothing', () => {
    expect(chipFor(buffer({}), 'latest')).toBeNull();
  });

  it('chipFor: unsaved edits read "unsaved"', () => {
    expect(chipFor(buffer({ working: 'edited' }), 'latest')).toBe('unsaved');
  });

  it('chipFor: untouched viewed revision reads "viewing vN"', () => {
    expect(chipFor(buffer({ working: 'old', viewedVersion: 3 }), 'latest')).toBe(
      'viewing v3',
    );
  });

  it('chipFor: viewed bytes equal to latest still read "viewing vN"', () => {
    expect(chipFor(buffer({ viewedVersion: 2 }), 'latest')).toBe('viewing v2');
  });
});
