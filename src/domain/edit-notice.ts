/**
 * The edit-notice decisions (DESIGN.md "Manual edits enter the
 * conversation"): whether the next send must announce a manual revision,
 * and the notice message body. Pure — the repository consults these at
 * append time.
 */
import { ARTIFACT_FENCE_MARKER } from './extract';
import type { Artifact, MessageKind, Unit } from './types';

/** The message kind marking a notice; absent means an ordinary chat message. */
export const EDIT_NOTICE_KIND: MessageKind = 'editNotice';

const NOTICE_PREFIX =
  'The user manually edited the artifact. The current artifact is:';

/** The manual revision the next send must announce, or null. */
export function pendingEditNotice(unit: Unit): Artifact | null {
  const latest = unit.artifacts.at(-1);
  if (latest === undefined || latest.source !== 'manual') {
    return null;
  }
  const announced = unit.messages.some(
    (message) =>
      message.kind === EDIT_NOTICE_KIND &&
      message.artifactVersion === latest.version,
  );
  return announced ? null : latest;
}

/** The notice message body: fixed prefix line + artifact-marked fence. */
export function editNoticeContent(
  artifactType: string,
  artifactContent: string,
): string {
  const body = artifactContent.endsWith('\n')
    ? artifactContent
    : artifactContent + '\n';
  return (
    `${NOTICE_PREFIX}\n\n` +
    `\`\`\`${artifactType} ${ARTIFACT_FENCE_MARKER}\n${body}\`\`\`\n`
  );
}
