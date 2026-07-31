/**
 * The only file IO in the application (DESIGN.md "The Dump Is a File").
 * Nothing below this layer sees a File, a Blob, or a picker.
 *
 * The two deliverers are exactly the callback shape the repository demands.
 * They differ on purpose: an ordinary export may use showSaveFilePicker,
 * because cancelling an export costs nothing; the replace backup may not,
 * because a cancellable backup is not a mandatory backup.
 */
import type { DatabaseDump } from '@/domain/types';

/** Save picker where available, anchor download otherwise. May reject. */
export function deliverExport(_dump: DatabaseDump): Promise<void> {
  throw new Error('not implemented: deliverExport');
}

/** Anchor download only — never the picker, so there is nothing to dismiss. */
export function deliverBackup(_backup: DatabaseDump): Promise<void> {
  throw new Error('not implemented: deliverBackup');
}

/** Resolves null when the chooser is dismissed; throws on a malformed file. */
export function readDumpFile(): Promise<DatabaseDump | null> {
  throw new Error('not implemented: readDumpFile');
}
