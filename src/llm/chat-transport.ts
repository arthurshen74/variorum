/**
 * The custom ChatTransport (DESIGN.md "Chat"): calls streamText in the
 * browser against the OpenAI-compatible endpoint — no server route. The
 * request is built from the LATEST SAVED version of the unit's
 * configuration at call time: model id, system prompt, sampling
 * parameters, reasoning effort. Reasoning parts are stripped from the
 * request context (never re-sent). This class is the designated seam: the
 * single file that would change if requests ever routed through a proxy.
 */
import type { ChatTransport, UIMessage, UIMessageChunk } from 'ai';

export interface ChatTransportDeps {
  /** Injectable for node tests; defaults to global fetch. */
  fetchImpl?: typeof fetch;
}

export class VariorumChatTransport implements ChatTransport<UIMessage> {
  constructor(
    readonly unitId: string,
    readonly deps: ChatTransportDeps = {},
  ) {}

  sendMessages(
    options: Parameters<ChatTransport<UIMessage>['sendMessages']>[0],
  ): Promise<ReadableStream<UIMessageChunk>> {
    void options;
    throw new Error('not implemented: VariorumChatTransport.sendMessages');
  }

  /** No server holds streams for us — always resolves null. */
  reconnectToStream(): Promise<ReadableStream<UIMessageChunk> | null> {
    throw new Error('not implemented: VariorumChatTransport.reconnectToStream');
  }
}
