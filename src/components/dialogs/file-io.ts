/**
 * The only file IO in the application (DESIGN.md "The Dump Is a File").
 * Nothing below this layer sees a File, a Blob, or a picker.
 *
 * The two deliverers are exactly the callback shape the repository demands.
 * They differ on purpose: an ordinary export may use showSaveFilePicker,
 * because cancelling an export costs nothing; the replace backup may not,
 * because a cancellable backup is not a mandatory backup.
 */
import {
  backupFilename,
  exportFilename,
  parseDump,
  serializeDump,
} from '@/domain/dump-file';
import type { DatabaseDump } from '@/domain/types';

const MIME_JSON = 'application/json';

/** Not in lib.dom; absent in Firefox, hence optional. */
declare global {
  interface Window {
    showSaveFilePicker?: (options: {
      suggestedName: string;
    }) => Promise<FileSystemFileHandle>;
  }
}

/** Save picker where available, anchor download otherwise. May reject. */
export async function deliverExport(dump: DatabaseDump): Promise<void> {
  const text = serializeDump(dump);
  const filename = exportFilename(new Date());
  if (window.showSaveFilePicker === undefined) {
    downloadText(text, filename);
    return;
  }
  // A dismissed picker rejects, and that rejection is the export not
  // happening: no anchor fallback, or Cancel would still write a file.
  const handle = await window.showSaveFilePicker({ suggestedName: filename });
  const writable = await handle.createWritable();
  await writable.write(text);
  await writable.close();
}

/** Anchor download only — never the picker, so there is nothing to dismiss. */
export async function deliverBackup(backup: DatabaseDump): Promise<void> {
  downloadText(serializeDump(backup), backupFilename(new Date()));
}

/** Resolves null when the chooser is dismissed; throws on a malformed file. */
export function readDumpFile(): Promise<DatabaseDump | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = MIME_JSON;
    input.addEventListener('cancel', () => {
      resolve(null);
    });
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (file === undefined) {
        resolve(null);
        return;
      }
      file
        .text()
        .then((text) => {
          resolve(parseDump(text));
        })
        .catch(reject);
    });
    input.click();
  });
}

function downloadText(text: string, filename: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: MIME_JSON }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  // Revoke a tick later: the download has to have started before the url
  // stops resolving.
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 0);
}
