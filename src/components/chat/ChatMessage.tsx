/**
 * One transcript row (DESIGN.md "Chat"): role styling, the version badge
 * on assistant messages, the collapsible Reasoning block, and the
 * partitioned content — prose, artifact chip in place of the lifted
 * fence, prose. While streaming the fence renders as a growing code
 * block; the chip appears only on completed messages.
 */
import type { ReactElement } from 'react';
import { isReasoningUIPart, isTextUIPart, type UIMessage } from 'ai';
import {
  Message,
  MessageContent,
  MessageResponse,
} from '@/components/ai-elements/message';
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from '@/components/ai-elements/reasoning';
import { partitionResponse } from '@/domain/extract';
import { ArtifactChip } from './ArtifactChip';
import { EditNoticeChip } from './EditNoticeChip';

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
  /**
   * Set when the persisted message is an edit notice — the whole message
   * renders as the collapsed "You edited" chip.
   */
  editNoticeVersion: number | null;
  isStreaming: boolean;
}

function joinText(message: UIMessage): string {
  return message.parts
    .filter(isTextUIPart)
    .map((part) => part.text)
    .join('');
}

function joinReasoning(message: UIMessage): string {
  return message.parts
    .filter(isReasoningUIPart)
    .map((part) => part.text)
    .join('');
}

export function ChatMessage({
  message,
  versionTag,
  artifactType,
  revisionVersion,
  editNoticeVersion,
  isStreaming,
}: ChatMessageProps): ReactElement {
  // A notice carries the whole artifact as request context; the transcript
  // shows the chip and nothing else.
  if (editNoticeVersion !== null) {
    return (
      <Message from={message.role}>
        <MessageContent>
          <EditNoticeChip artifactVersion={editNoticeVersion} />
        </MessageContent>
      </Message>
    );
  }

  const reasoning = joinReasoning(message);
  const text = joinText(message);
  // Nothing is THE artifact until the message completes, so a fence still
  // streaming stays inline as an ordinary code block.
  const partitioned = isStreaming
    ? { before: text, artifact: null, after: '' }
    : partitionResponse(text, artifactType);

  return (
    <Message from={message.role}>
      <MessageContent>
        {reasoning !== '' ? (
          <Reasoning isStreaming={isStreaming}>
            <ReasoningTrigger>Reasoning</ReasoningTrigger>
            <ReasoningContent>{reasoning}</ReasoningContent>
          </Reasoning>
        ) : null}
        {partitioned.before !== '' ? (
          <MessageResponse>{partitioned.before}</MessageResponse>
        ) : null}
        {partitioned.artifact !== null ? (
          <ArtifactChip revisionVersion={revisionVersion} />
        ) : null}
        {partitioned.after !== '' ? (
          <MessageResponse>{partitioned.after}</MessageResponse>
        ) : null}
      </MessageContent>
      {versionTag !== '' ? (
        <span className="text-[11px] text-muted-foreground">{versionTag}</span>
      ) : null}
    </Message>
  );
}
