/**
 * The anti-corruption boundary (DESIGN.md "State Architecture"): the AI
 * SDK's message shapes belong to Vercel and churn across majors; the
 * persistence format belongs to us and must outlive them. Everything the
 * SDK produces crosses into the domain through this module — nothing
 * below this line imports SDK types.
 */
import type { ModelMessage, UIMessage } from 'ai';
import type { AssistantCompletion, Message } from '@/domain/types';

export function toAssistantCompletion(args: {
  content: string;
  reasoning?: string;
  sentAt: string;
  receivedFinishedAt: string;
}): AssistantCompletion {
  return {
    content: args.content,
    ...(args.reasoning !== undefined ? { reasoning: args.reasoning } : {}),
    sentAt: args.sentAt,
    receivedFinishedAt: args.receivedFinishedAt,
  };
}

/**
 * Seeds useChat from a unit's persisted messages. Content becomes a text
 * part; persisted reasoning becomes a reasoning part (rendered collapsed).
 */
export function toUIMessages(messages: Message[]): UIMessage[] {
  void messages;
  throw new Error('not implemented: toUIMessages');
}

/**
 * Request context: strips ALL reasoning parts before conversion —
 * reasoning is display-and-record only, never re-sent (DESIGN.md "Chat").
 */
export function toModelMessages(messages: UIMessage[]): ModelMessage[] {
  void messages;
  throw new Error('not implemented: toModelMessages');
}

/**
 * onFinish → the domain completion: concatenates the finished message's
 * text parts and reasoning parts; omits `reasoning` when there are none.
 */
export function completionFromUIMessage(
  message: UIMessage,
  sentAt: string,
  receivedFinishedAt: string,
): AssistantCompletion {
  void message;
  void sentAt;
  void receivedFinishedAt;
  throw new Error('not implemented: completionFromUIMessage');
}
