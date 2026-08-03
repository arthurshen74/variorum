/**
 * The compact stand-in for the lifted fence in the transcript
 * (DESIGN.md "Chat"): "Artifact → revision N", or "Artifact unchanged"
 * for a byte-identical re-emission that minted nothing.
 */
import type { ReactElement } from 'react';

export interface ArtifactChipProps {
  revisionVersion: number | null;
}

export function ArtifactChip(props: ArtifactChipProps): ReactElement {
  void props;
  throw new Error('not implemented: ArtifactChip');
}
