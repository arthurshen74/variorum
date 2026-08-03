/**
 * The Configurations dialog (DESIGN.md "Management UI"): four views —
 * List, Add, Edit, Endpoint. Draft state is component state here and
 * dies with the dialog; every mutation goes through the repository.
 */

export interface ConfigurationsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function ConfigurationsDialog(
  _props: ConfigurationsDialogProps,
): never {
  throw new Error('not implemented: ConfigurationsDialog');
}
