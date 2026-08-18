/**
 * The edit-notice decisions (DESIGN.md "Manual edits enter the
 * conversation"): whether the next send must announce a manual revision,
 * and the notice message body. Pure — the repository consults these at
 * append time.
 */
import type { Artifact, Unit } from './types';

/** The manual revision the next send must announce, or null. */
export function pendingEditNotice(unit: Unit): Artifact | null {
  void unit;
  throw new Error('not implemented: pendingEditNotice');
}

/** The notice message body: fixed prefix line + artifact-marked fence. */
export function editNoticeContent(
  artifactType: string,
  artifactContent: string,
): string {
  void artifactType;
  void artifactContent;
  throw new Error('not implemented: editNoticeContent');
}
