/**
 * The import-merge algorithm (DESIGN.md "Import Is a Merge") as a PURE
 * function: (local dump, incoming dump) → a plan of records to write plus
 * the report. No IO here — the repository executes the plan. That purity
 * is what makes this the most testable code in the app.
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

export interface MergePlan {
  /** Name records to write (new names, including renamed lineages). */
  configurations: Configuration[];
  /** Version records to write (fast-forwards and renamed lineages). */
  configurationVersions: ConfigurationVersion[];
  /** Units to write (additions, fast-forwards, kept-both clones). */
  units: Unit[];
  report: ImportReport;
}

export function planMerge(
  _local: DatabaseDump,
  _incoming: DatabaseDump,
): MergePlan {
  // TODO(next session): implement the trichotomy per DESIGN.md —
  // lineage zip-compare with linkml~2 renames, unit prefix detection over
  // BOTH arrays in the same direction (manual-save edge), metadata
  // local-wins. Until then, import is unavailable rather than wrong.
  throw new Error(
    'import-merge is not implemented yet (see DESIGN.md "Import Is a Merge")',
  );
}
