/**
 * The revision history dialog (DESIGN.md "Revision History & Restore"):
 * every revision newest first — version, time, source — each viewable, and
 * each restorable except the latest. Restore is a manual save of that
 * revision's content; history is never rewritten. View is the pane's
 * business: this dialog only reports the row that was clicked.
 */
import type { ReactElement } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { repository } from '@/persistence/repository';
import type { Artifact, Unit } from '@design/repository-api';

interface HistoryDialogProps {
  unit: Unit;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** View action: the pane gates, seats the buffer, and closes the dialog. */
  onView: (artifact: Artifact) => void;
}

export function HistoryDialog({
  unit,
  open,
  onOpenChange,
  onView,
}: HistoryDialogProps): ReactElement {
  const latestVersion = unit.artifacts.at(-1)?.version;
  const newestFirst = [...unit.artifacts].reverse();

  function restore(content: string) {
    void repository.saveManualEdit(unit.id, content);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>History</DialogTitle>
          <DialogDescription>
            Viewing puts a revision into the editor; restoring saves that
            revision's content as a new revision. Nothing is rewritten or
            removed.
          </DialogDescription>
        </DialogHeader>
        <ul className="max-h-[60vh] divide-y overflow-y-auto">
          {newestFirst.map((artifact) => (
            <li
              key={artifact.version}
              className="flex items-center gap-3 py-2 text-sm"
            >
              <span className="w-10 font-medium">v{artifact.version}</span>
              <span className="text-muted-foreground">
                {new Date(artifact.savedAt).toLocaleString()}
              </span>
              <span className="text-xs text-muted-foreground">
                {artifact.source}
              </span>
              <div className="ml-auto flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onView(artifact)}
                >
                  View
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={artifact.version === latestVersion}
                  onClick={() => restore(artifact.content)}
                >
                  Restore
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
