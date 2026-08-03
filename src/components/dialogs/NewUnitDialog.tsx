/**
 * The new-unit dialog (DESIGN.md "Management UI"): conversation name plus
 * a picker over active configurations. Create calls the repository;
 * onCreated lets AppShell select the new unit.
 */

export interface NewUnitDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (unitId: string) => void;
}

export default function NewUnitDialog(_props: NewUnitDialogProps): never {
  throw new Error('not implemented: NewUnitDialog');
}
