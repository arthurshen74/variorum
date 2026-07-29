/**
 * The anti-corruption boundary (DESIGN.md "State Architecture"): the AI
 * SDK's message shapes belong to Vercel and churn across majors; the
 * persistence format belongs to us and must outlive them. Everything the
 * SDK produces crosses into the domain through this module — nothing
 * below this line imports SDK types.
 *
 * Grows with the chat implementation (onFinish → AssistantCompletion,
 * reasoning passthrough for chain-of-thought display).
 */
import type { AssistantCompletion } from '@/domain/types';

export function toAssistantCompletion(args: {
  content: string;
  sentAt: string;
  receivedFinishedAt: string;
}): AssistantCompletion {
  return {
    content: args.content,
    sentAt: args.sentAt,
    receivedFinishedAt: args.receivedFinishedAt,
  };
}
