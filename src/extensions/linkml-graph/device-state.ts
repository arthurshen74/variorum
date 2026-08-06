/**
 * Per-unit layout persistence (DESIGN.md "Extension device state"):
 * localStorage only — never the store, never IndexedDB, never an export.
 */

export interface GraphDeviceState {
  positions: Record<string, { x: number; y: number }>;
  viewport?: { x: number; y: number; zoom: number };
}

export const DEVICE_STATE_KEY_PREFIX = 'variorum.ext.linkml-graph.';

const EMPTY_STATE: GraphDeviceState = { positions: {} };

/** Missing or corrupt stored value yields { positions: {} }. */
export function loadDeviceState(unitId: string): GraphDeviceState {
  const stored = localStorage.getItem(DEVICE_STATE_KEY_PREFIX + unitId);
  if (stored === null) return { ...EMPTY_STATE };

  let parsed: unknown;
  try {
    parsed = JSON.parse(stored);
  } catch {
    return { ...EMPTY_STATE };
  }

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    typeof (parsed as GraphDeviceState).positions !== 'object' ||
    (parsed as GraphDeviceState).positions === null
  ) {
    return { ...EMPTY_STATE };
  }
  return parsed as GraphDeviceState;
}

export function saveDeviceState(unitId: string, state: GraphDeviceState): void {
  localStorage.setItem(DEVICE_STATE_KEY_PREFIX + unitId, JSON.stringify(state));
}
