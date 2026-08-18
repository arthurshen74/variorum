/**
 * The compact stand-in for an edit-notice message in the transcript
 * (DESIGN.md "Manual edits enter the conversation"): "You edited →
 * revision N", resolved through the notice's artifactVersion.
 */
import type { ReactElement } from 'react';

export interface EditNoticeChipProps {
  artifactVersion: number;
}

export function EditNoticeChip({
  artifactVersion,
}: EditNoticeChipProps): ReactElement {
  void artifactVersion;
  throw new Error('not implemented: EditNoticeChip');
}
