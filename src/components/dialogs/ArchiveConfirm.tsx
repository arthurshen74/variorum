/**
 * Archive confirmation for units (DESIGN.md "Management UI"): archiving
 * is one-way until an archived-units view exists, so it asks first.
 * Open while `unit` is non-null; confirming calls the repository, then
 * onArchived lets AppShell deselect.
 */
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { repository } from '@/persistence/repository';

export interface ArchiveConfirmProps {
  unit: { id: string; conversationName: string } | null;
  onClose: () => void;
  onArchived: (unitId: string) => void;
}

export default function ArchiveConfirm({
  unit,
  onClose,
  onArchived,
}: ArchiveConfirmProps) {
  if (unit === null) return null;

  async function archive(unitId: string) {
    await repository.archiveUnit(unitId);
    onArchived(unitId);
  }

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Archive conversation</DialogTitle>
          <DialogDescription>
            Archiving “{unit.conversationName}” removes it from the sidebar.
            Nothing is deleted, but this slice ships no archived-units view, so
            it is one-way for now.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              void archive(unit.id);
            }}
          >
            Archive
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
