/**
 * The LinkML graph viewer (DESIGN.md "LinkML Graph Viewer"): a read-only
 * React Flow rendering of the artifact. Never calls onChange — layout
 * interaction is presentation, not artifact data.
 */
import type { ReactElement } from 'react';

import type { EditorProps } from '../extension';

export default function LinkmlGraphViewer(_props: EditorProps): ReactElement {
  throw new Error('not implemented: LinkmlGraphViewer');
}
