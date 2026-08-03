/**
 * One transcript row (DESIGN.md "Chat"): role styling, the version badge
 * on assistant messages, the collapsible Reasoning block, and the
 * partitioned content — prose, artifact chip in place of the lifted
 * fence, prose. While streaming the fence renders as a growing code
 * block; the chip appears only on completed messages.
 */
import type { ReactElement } from 'react';
import type { UIMessage } from 'ai';

export interface ChatMessageProps {
  message: UIMessage;
  /** "linkml.4" — empty for user messages renders no badge. */
  versionTag: string;
  artifactType: string;
  /**
   * Revision minted by this message (chip "revision N"); null with a
   * matching fence present means the "unchanged" chip.
   */
  revisionVersion: number | null;
  isStreaming: boolean;
}

export function ChatMessage(props: ChatMessageProps): ReactElement {
  void props;
  throw new Error('not implemented: ChatMessage');
}
