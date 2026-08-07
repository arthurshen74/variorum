/**
 * The revision history dialog (DESIGN.md "Revision History & Restore"):
 * every revision newest first — version, time, source — each restorable
 * except the latest. Restore is a manual save of that revision's content;
 * history is never rewritten.
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
import type { Unit } from '@design/repository-api';

interface HistoryDialogProps {
  unit: Unit;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function HistoryDialog({
  unit,
  open,
  onOpenChange,
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
            Restoring saves that revision's content as a new revision —
            nothing is rewritten or removed.
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
              <Button
                className="ml-auto"
                variant="outline"
                size="sm"
                disabled={artifact.version === latestVersion}
                onClick={() => restore(artifact.content)}
              >
                Restore
              </Button>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
