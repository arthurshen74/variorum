/**
 * ALL reads (DESIGN.md "State Architecture": the repository writes; the
 * store reads). UI components and LLM tool handlers alike get their data
 * through these — there are no read methods on the repository.
 *
 * NOTE: selectors that build a new collection (filter/map) must be wrapped
 * in `useShallow` (zustand/react/shallow) at the React call site, or React
 * sees a fresh snapshot every render and loops. Non-React callers can use
 * them raw against getState().
 */
import type { Configuration, ConfigurationVersion, Unit } from '@/domain/types';
import type { VariorumState } from './store';

export const selectHydrated = (s: VariorumState): boolean => s.hydrated;

export const selectActiveUnits = (s: VariorumState): Unit[] =>
  s.units.filter((u) => !u.archived);

export const selectArchivedUnits = (s: VariorumState): Unit[] =>
  s.units.filter((u) => u.archived);

export const selectUnit =
  (unitId: string) =>
  (s: VariorumState): Unit | undefined =>
    s.units.find((u) => u.id === unitId);

export const selectActiveConfigurations = (s: VariorumState): Configuration[] =>
  s.configurations.filter((c) => !c.archived);

export const selectConfiguration =
  (name: string) =>
  (s: VariorumState): Configuration | undefined =>
    s.configurations.find((c) => c.name === name);

/** The latest SAVED version — the one generation always uses. */
export const selectLatestVersion =
  (name: string) =>
  (s: VariorumState): ConfigurationVersion | undefined =>
    s.configurationVersions
      .filter((v) => v.name === name)
      .reduce<ConfigurationVersion | undefined>(
        (best, v) => (best === undefined || v.version > best.version ? v : best),
        undefined,
      );

export const selectDirtySinceExport = (s: VariorumState): boolean =>
  s.dirtySinceExport;
