/**
 * Pure decisions for the artifact pane's View flow (DESIGN.md "Revision
 * History & Restore"): whether View may seat the buffer immediately or
 * must confirm first, and what the pane's header chip reads.
 */

export interface ViewBuffer {
  unitId: string | null;
  base: string;
  working: string;
  /** Designator seated by View and not yet touched; null otherwise. */
  viewedVersion: number | null;
}

export type ViewGate = 'seat' | 'confirm';

/** Confirm only when the buffer holds actual unsaved edits. */
export function viewGateFor(
  buffer: ViewBuffer,
  latestContent: string,
): ViewGate {
  // An untouched viewed revision is not an edit: its content is an old
  // revision, recoverable from History, so replacing it destroys nothing.
  if (buffer.viewedVersion !== null || buffer.working === latestContent) {
    return 'seat';
  }
  return 'confirm';
}

/** Header chip text: "viewing vN", "unsaved", or null for a clean buffer. */
export function chipFor(
  buffer: ViewBuffer,
  latestContent: string,
): string | null {
  if (buffer.viewedVersion !== null) {
    return `viewing v${buffer.viewedVersion}`;
  }
  if (buffer.working !== latestContent) {
    return 'unsaved';
  }
  return null;
}
