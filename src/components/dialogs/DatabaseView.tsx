/**
 * The Database view of the Configurations dialog (DESIGN.md "Management
 * UI"): export, import (merge), and replace-from-backup as three separate
 * actions. Outcomes render inline; a successful replace reports upward so
 * the shell can deselect the active unit.
 */

export interface DatabaseViewProps {
  onReplaced: () => void;
}

export default function DatabaseView(_props: DatabaseViewProps) {
  throw new Error('not implemented: DatabaseView');
}
