/**
 * The Models/Providers view of the Configurations dialog (DESIGN.md
 * "Management UI", "Models and Providers"): the device-local document
 * rendered as a tree of endpoints and their models, with add/edit/delete
 * for both, reassignment, the key-gap flag, and the "referenced, not
 * bound" hint list.
 */
export interface ProvidersViewProps {
  onBack: () => void;
}

export default function ProvidersView(props: ProvidersViewProps) {
  void props;
  throw new Error('not implemented: ProvidersView');
}
