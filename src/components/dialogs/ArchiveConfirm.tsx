/**
 * Archive confirmation for units (DESIGN.md "Management UI"): archiving
 * is one-way until an archived-units view exists, so it asks first.
 * Open while `unit` is non-null; confirming calls the repository, then
 * onArchived lets AppShell deselect.
 */

export interface ArchiveConfirmProps {
  unit: { id: string; conversationName: string } | null;
  onClose: () => void;
  onArchived: (unitId: string) => void;
}

export default function ArchiveConfirm(_props: ArchiveConfirmProps): never {
  throw new Error('not implemented: ArchiveConfirm');
}
