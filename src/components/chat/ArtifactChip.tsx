/**
 * The compact stand-in for the lifted fence in the transcript
 * (DESIGN.md "Chat"): "Artifact → revision N", or "Artifact unchanged"
 * for a byte-identical re-emission that minted nothing.
 */
import type { ReactElement } from 'react';
import { FileCode2 } from 'lucide-react';

export interface ArtifactChipProps {
  revisionVersion: number | null;
}

export function ArtifactChip({
  revisionVersion,
}: ArtifactChipProps): ReactElement {
  return (
    <span className="my-2 inline-flex w-fit items-center gap-1.5 rounded-md border bg-muted/40 px-2 py-1 text-xs text-muted-foreground">
      <FileCode2 className="size-3.5" />
      {revisionVersion === null
        ? 'Artifact unchanged'
        : `Artifact → revision ${revisionVersion}`}
    </span>
  );
}
