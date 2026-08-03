/**
 * The anti-corruption boundary (DESIGN.md "State Architecture"): the AI
 * SDK's message shapes belong to Vercel and churn across majors; the
 * persistence format belongs to us and must outlive them. Everything the
 * SDK produces crosses into the domain through this module — nothing
 * below this line imports SDK types.
 */
import type { ModelMessage, UIMessage } from 'ai';
import type { AssistantCompletion, Message } from '@/domain/types';

// The SDK's part discriminators — the two shapes Variorum ever produces.
const PART_TEXT = 'text';
const PART_REASONING = 'reasoning';

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
  return messages.map((message, index) => ({
    // Position is the identity: the conversation is append-only, so an
    // index is stable across re-seeds and unique within the unit.
    id: `message-${index}`,
    role: message.role,
    parts: [
      ...(message.reasoning !== undefined
        ? [
            {
              type: PART_REASONING,
              text: message.reasoning,
              state: 'done',
            } as const,
          ]
        : []),
      { type: PART_TEXT, text: message.content } as const,
    ],
  }));
}

/**
 * Request context: text parts only. Reasoning is display-and-record only,
 * never re-sent (DESIGN.md "Chat"), and dropping everything but text is
 * what makes that structural rather than a rule someone has to remember.
 */
export function toModelMessages(messages: UIMessage[]): ModelMessage[] {
  return messages.map((message): ModelMessage => {
    const content = message.parts
      .filter((part) => part.type === PART_TEXT)
      .map((part) => part.text)
      .join('');
    switch (message.role) {
      case 'system':
        return { role: 'system', content };
      case 'user':
        return { role: 'user', content };
      case 'assistant':
        return { role: 'assistant', content };
    }
  });
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
  const text = message.parts.filter((part) => part.type === PART_TEXT);
  const reasoning = message.parts.filter(
    (part) => part.type === PART_REASONING,
  );
  return toAssistantCompletion({
    content: text.map((part) => part.text).join(''),
    ...(reasoning.length > 0
      ? { reasoning: reasoning.map((part) => part.text).join('') }
      : {}),
    sentAt,
    receivedFinishedAt,
  });
}
