/**
 * Dump text — the serialize/parse half of DESIGN.md "The Dump Is a File".
 * Pure: text in, text out, no IO.
 *
 * `parseDump` is the STRUCTURAL boundary gate. It narrows untrusted JSON to a
 * DatabaseDump, rebuilding every record from its declared fields so unknown
 * keys never reach IndexedDB. It deliberately does NOT judge meaning — schema
 * version and referential integrity stay in assertValidDump, which runs after
 * and trusts the shape this module establishes.
 *
 * Filenames take their clock as an argument so they stay pure; file-io.ts
 * supplies the real one.
 */
import type { DatabaseDump } from './types';

/** Pretty-printed so a backup is diffable and readable. */
export function serializeDump(_dump: DatabaseDump): string {
  throw new Error('not implemented: serializeDump');
}

/** Throws on anything that is not structurally a dump. */
export function parseDump(_text: string): DatabaseDump {
  throw new Error('not implemented: parseDump');
}

export function exportFilename(_now: Date): string {
  throw new Error('not implemented: exportFilename');
}

export function backupFilename(_now: Date): string {
  throw new Error('not implemented: backupFilename');
}
