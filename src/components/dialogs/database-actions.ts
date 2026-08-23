/**
 * Action orchestration for the Database view (DESIGN.md "Management UI",
 * the Database view). Pure ports-in, outcome-out: the component renders
 * outcomes, this module decides them. No React, no IO of its own — the
 * repository and file-io functions arrive as an injected ports object,
 * which is what keeps these paths unit-testable in node.
 */
import type { ImportReport } from '@design/repository-api';
import type { DatabaseDump } from '@/domain/types';

/** The slice of repository + file-io the Database view drives. */
export interface DatabasePorts {
  exportDatabase(deliver: (dump: DatabaseDump) => Promise<void>): Promise<void>;
  importDatabase(dump: DatabaseDump): Promise<ImportReport>;
  replaceDatabase(
    dump: DatabaseDump,
    deliverBackup: (backup: DatabaseDump) => Promise<void>,
  ): Promise<DatabaseDump>;
  deliverExport(dump: DatabaseDump): Promise<void>;
  deliverBackup(backup: DatabaseDump): Promise<void>;
  readDumpFile(): Promise<DatabaseDump | null>;
}

export type ActionOutcome =
  | { kind: 'success'; lines: string[] }
  | { kind: 'cancelled' }
  | { kind: 'error'; message: string };

export type PickedFile =
  | { kind: 'picked'; dump: DatabaseDump }
  | { kind: 'cancelled' }
  | { kind: 'error'; message: string };

/** Export via the picker deliverer; a dismissed picker is cancelled, not error. */
export function runExport(_ports: DatabasePorts): Promise<ActionOutcome> {
  throw new Error('not implemented: runExport');
}

/** Chooser → parse gate → merge; success lines render the ImportReport. */
export function runImport(_ports: DatabasePorts): Promise<ActionOutcome> {
  throw new Error('not implemented: runImport');
}

/** Replace step 1: chooser + parse gate only. Nothing is confirmed or written. */
export function pickReplaceFile(_ports: DatabasePorts): Promise<PickedFile> {
  throw new Error('not implemented: pickReplaceFile');
}

/** Replace step 2, after explicit confirmation: backup-then-wipe. */
export function runReplace(
  _ports: DatabasePorts,
  _dump: DatabaseDump,
): Promise<ActionOutcome> {
  throw new Error('not implemented: runReplace');
}

/** Report lines; empty categories omitted, skipped count always present. */
export function importReportLines(_report: ImportReport): string[] {
  throw new Error('not implemented: importReportLines');
}
