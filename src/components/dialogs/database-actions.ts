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

const ABORT_ERROR = 'AbortError';

/** Export via the picker deliverer; a dismissed picker is cancelled, not error. */
export async function runExport(ports: DatabasePorts): Promise<ActionOutcome> {
  try {
    await ports.exportDatabase(ports.deliverExport);
  } catch (error) {
    if (isAbort(error)) {
      return { kind: 'cancelled' };
    }
    return { kind: 'error', message: errorMessage(error) };
  }
  return { kind: 'success', lines: ['Database exported.'] };
}

/** Chooser → parse gate → merge; success lines render the ImportReport. */
export async function runImport(ports: DatabasePorts): Promise<ActionOutcome> {
  try {
    const dump = await ports.readDumpFile();
    if (dump === null) {
      return { kind: 'cancelled' };
    }
    const report = await ports.importDatabase(dump);
    return { kind: 'success', lines: importReportLines(report) };
  } catch (error) {
    return { kind: 'error', message: errorMessage(error) };
  }
}

/** Replace step 1: chooser + parse gate only. Nothing is confirmed or written. */
export async function pickReplaceFile(
  ports: DatabasePorts,
): Promise<PickedFile> {
  try {
    const dump = await ports.readDumpFile();
    if (dump === null) {
      return { kind: 'cancelled' };
    }
    return { kind: 'picked', dump };
  } catch (error) {
    return { kind: 'error', message: errorMessage(error) };
  }
}

/** Replace step 2, after explicit confirmation: backup-then-wipe. */
export async function runReplace(
  ports: DatabasePorts,
  dump: DatabaseDump,
): Promise<ActionOutcome> {
  try {
    await ports.replaceDatabase(dump, ports.deliverBackup);
  } catch (error) {
    return { kind: 'error', message: errorMessage(error) };
  }
  return {
    kind: 'success',
    lines: [
      'Database replaced from the chosen file.',
      'A pre-replace backup was downloaded first.',
    ],
  };
}

/** Report lines; empty categories omitted, skipped count always present. */
export function importReportLines(report: ImportReport): string[] {
  const lines: string[] = [];
  if (report.configurationsAdded.length > 0) {
    lines.push(`Configurations added: ${report.configurationsAdded.join(', ')}`);
  }
  if (report.configurationsFastForwarded.length > 0) {
    const designators = report.configurationsFastForwarded.flatMap(
      ({ name, newVersions }) => newVersions.map((v) => `${name}.${v}`),
    );
    lines.push(`Configuration versions added: ${designators.join(', ')}`);
  }
  if (report.lineagesRenamed.length > 0) {
    const renames = report.lineagesRenamed.map(
      ({ from, to }) => `${from} → ${to}`,
    );
    lines.push(`Configuration lineages renamed: ${renames.join(', ')}`);
  }
  if (report.unitsAdded.length > 0) {
    lines.push(`Units added: ${report.unitsAdded.length}`);
  }
  if (report.unitsFastForwarded.length > 0) {
    lines.push(`Units extended: ${report.unitsFastForwarded.length}`);
  }
  if (report.unitsKeptBoth.length > 0) {
    lines.push(`Units kept as both copies: ${report.unitsKeptBoth.length}`);
  }
  lines.push(`Identical records skipped: ${report.skippedIdentical}`);
  return lines;
}

// A dismissed save picker rejects with a DOMException; the name is the
// portable part of that contract, so nothing here depends on the class.
function isAbort(error: unknown): boolean {
  return error instanceof Error && error.name === ABORT_ERROR;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
