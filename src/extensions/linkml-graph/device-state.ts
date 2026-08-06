/**
 * Per-unit layout persistence (DESIGN.md "Extension device state"):
 * localStorage only — never the store, never IndexedDB, never an export.
 */

export interface GraphDeviceState {
  positions: Record<string, { x: number; y: number }>;
  viewport?: { x: number; y: number; zoom: number };
}

export const DEVICE_STATE_KEY_PREFIX = 'variorum.ext.linkml-graph.';

/** Missing or corrupt stored value yields { positions: {} }. */
export function loadDeviceState(_unitId: string): GraphDeviceState {
  throw new Error('not implemented: loadDeviceState');
}

export function saveDeviceState(
  _unitId: string,
  _state: GraphDeviceState,
): void {
  throw new Error('not implemented: saveDeviceState');
}
