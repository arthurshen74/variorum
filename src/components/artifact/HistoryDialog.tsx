/**
 * The revision history dialog (DESIGN.md "Revision History & Restore"):
 * every revision newest first — version, time, source — each restorable
 * except the latest. Restore is a manual save of that revision's content;
 * history is never rewritten.
 */
import type { ReactElement } from 'react';

import type { Unit } from '@design/repository-api';

interface HistoryDialogProps {
  unit: Unit;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function HistoryDialog(_props: HistoryDialogProps): ReactElement {
  throw new Error('not implemented: HistoryDialog');
}
