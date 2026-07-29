/**
 * The ONE Zustand store (DESIGN.md "State Architecture"), hydrated from
 * IndexedDB at boot. After boot it is the working copy of the database:
 * reads are synchronous selectors, and the ONLY writer is the repository —
 * components and tool handlers never call setState. A vanilla store, so
 * non-React callers (LLM tool handlers) share the same state as the UI.
 */
import { createStore } from 'zustand/vanilla';
import { useStore } from 'zustand';
import type { Configuration, ConfigurationVersion, Unit } from '@/domain/types';

export interface VariorumState {
  hydrated: boolean;
  configurations: Configuration[];
  configurationVersions: ConfigurationVersion[];
  units: Unit[];
  /**
   * True whenever a mutation has happened since the last export. Prune
   * REQUIRES this to be false (DESIGN.md "Prune"). Boot sets it true,
   * conservatively: this session has exported nothing yet.
   */
  dirtySinceExport: boolean;
}

export const variorumStore = createStore<VariorumState>(() => ({
  hydrated: false,
  configurations: [],
  configurationVersions: [],
  units: [],
  dirtySinceExport: true,
}));

/** React hook over the vanilla store. Selectors live in selectors.ts. */
export function useVariorum<T>(selector: (state: VariorumState) => T): T {
  return useStore(variorumStore, selector);
}
