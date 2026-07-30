/**
 * The import-merge algorithm (DESIGN.md "Import Is a Merge") as a PURE
 * function: (local dump, incoming dump) → a plan of records to write plus
 * the report. No IO and no nondeterminism here — the repository executes
 * the plan and supplies the uuid mint. That purity is what makes this the
 * most testable code in the app.
 *
 * The axiom: import never overwrites, never renumbers, never deletes —
 * when histories disagree, it makes room instead.
 *   identical → skip · strict prefix → fast-forward · diverged → keep both
 */
import type {
  Configuration,
  ConfigurationVersion,
  DatabaseDump,
  ImportReport,
  Unit,
} from './types';

/** Suffix separator for minted lineage names: linkml → linkml~2. */
export const RENAME_SEPARATOR = '~';
/** Appended to a kept-both clone's conversationName. */
export const IMPORTED_TAG = ' (imported)';

export interface MergePlan {
  /** Name records to write (new names, including renamed lineages). */
  configurations: Configuration[];
  /** Version records to write (fast-forwards and renamed lineages). */
  configurationVersions: ConfigurationVersion[];
  /** Units to write (additions, fast-forwards, kept-both clones). */
  units: Unit[];
  report: ImportReport;
}

/** mintUnitId supplies fresh uuids for kept-both clones. */
export function planMerge(
  _local: DatabaseDump,
  _incoming: DatabaseDump,
  _mintUnitId: () => string,
): MergePlan {
  throw new Error('not implemented: planMerge');
}
