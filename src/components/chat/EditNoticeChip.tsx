/**
 * The compact stand-in for an edit-notice message in the transcript
 * (DESIGN.md "Manual edits enter the conversation"): "You edited →
 * revision N", resolved through the notice's artifactVersion.
 */
import type { ReactElement } from 'react';
import { PencilLine } from 'lucide-react';

export interface EditNoticeChipProps {
  artifactVersion: number;
}

export function EditNoticeChip({
  artifactVersion,
}: EditNoticeChipProps): ReactElement {
  return (
    <span className="my-2 inline-flex w-fit items-center gap-1.5 rounded-md border bg-muted/40 px-2 py-1 text-xs text-muted-foreground">
      <PencilLine className="size-3.5" />
      {`You edited → revision ${artifactVersion}`}
    </span>
  );
}
