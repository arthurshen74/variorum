/**
 * [G2] Per-unit layout persistence (DESIGN.md "Extension device state"):
 * localStorage round-trip, boundary defaults, and the exact key.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  loadDeviceState,
  saveDeviceState,
  type GraphDeviceState,
} from './device-state';

let store: Map<string, string>;

beforeEach(() => {
  store = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, String(value));
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('[G2] device state', () => {
  it('save then load round-trips positions and viewport', () => {
    const state: GraphDeviceState = {
      positions: { Person: { x: 10, y: 20 }, Dog: { x: -5, y: 0 } },
      viewport: { x: 1, y: 2, zoom: 0.75 },
    };
    saveDeviceState('unit-1', state);
    expect(loadDeviceState('unit-1')).toEqual(state);
  });

  it('nothing stored yields the empty default', () => {
    expect(loadDeviceState('unknown-unit')).toEqual({ positions: {} });
  });

  it('corrupt stored JSON yields the empty default', () => {
    store.set('variorum.ext.linkml-graph.unit-1', 'not json {');
    expect(loadDeviceState('unit-1')).toEqual({ positions: {} });
  });

  it('the storage key is exactly variorum.ext.linkml-graph.<unitId>', () => {
    saveDeviceState('unit-1', { positions: { A: { x: 0, y: 0 } } });
    expect(store.has('variorum.ext.linkml-graph.unit-1')).toBe(true);
    expect(store.size).toBe(1);
  });
});
