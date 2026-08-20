/**
 * [G2] Usage plumbing through the transport (DESIGN.md "Token usage
 * display"): the request opts into stream_options.include_usage, and the
 * server's terminal usage payload crosses the boundary as UsageMetadata
 * on the finish chunk — tagged with the modelName of the version that
 * built the request. Filter by file — older manifests reuse the [G2] tag.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import type {
  LanguageModelUsage,
  TextStreamPart,
  ToolSet,
  UIMessage,
  UIMessageChunk,
} from 'ai';
import {
  FINISH_REASON_LENGTH,
  TRUNCATED_RESPONSE_MESSAGE,
  VariorumChatTransport,
  finishUsageMetadata,
} from './chat-transport';
import { variorumStore } from '@/state/store';
import type { ConfigurationVersion } from '@/domain/types';

// node has no localStorage; the transport reads the base URL through it.
const storage = new Map<string, string>();
(globalThis as Record<string, unknown>).localStorage = {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => void storage.set(key, value),
  removeItem: (key: string) => void storage.delete(key),
};

const VERSION_ONE: ConfigurationVersion = {
  name: 'linkml',
  version: 1,
  modelName: 'test-model',
  systemPrompt: 'SYSTEM-PROMPT-V1',
};

function seedStore(versions: ConfigurationVersion[]): void {
  variorumStore.setState({
    hydrated: true,
    configurations: [
      { name: 'linkml', artifactType: 'yaml', archived: false },
    ],
    configurationVersions: versions,
    units: [
      {
        id: 'unit-1',
        conversationName: 'thread',
        configName: 'linkml',
        createdAt: '2026-08-03T09:00:00.000Z',
        archived: false,
        messages: [],
        artifacts: [],
      },
    ],
  });
}

interface WireUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

function sseBody(
  deltas: Record<string, unknown>[],
  finish = 'stop',
  usage?: WireUsage,
): string {
  const chunk = (payload: Record<string, unknown>) =>
    JSON.stringify({
      id: 'r1',
      object: 'chat.completion.chunk',
      created: 0,
      model: 'test-model',
      ...payload,
    });
  const events = [
    ...deltas.map((delta) =>
      chunk({ choices: [{ index: 0, delta, finish_reason: null }] }),
    ),
    chunk({ choices: [{ index: 0, delta: {}, finish_reason: finish }] }),
    // OpenAI include_usage convention: a terminal chunk with empty
    // choices carrying the usage object.
    ...(usage !== undefined ? [chunk({ choices: [], usage })] : []),
  ];
  return events.map((e) => `data: ${e}\n\n`).join('') + 'data: [DONE]\n\n';
}

function scriptedFetch(
  deltas: Record<string, unknown>[],
  finish = 'stop',
  usage?: WireUsage,
) {
  const bodies: Record<string, unknown>[] = [];
  const fetchImpl = (async (
    input: string | URL | Request,
    init?: RequestInit,
  ) => {
    void input;
    bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    return new Response(sseBody(deltas, finish, usage), {
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
    });
  }) as typeof fetch;
  return { bodies, fetchImpl };
}

const USER_HI: UIMessage = {
  id: 'm1',
  role: 'user',
  parts: [{ type: 'text', text: 'hi' }],
};

function sendOptions(messages: UIMessage[]) {
  return {
    trigger: 'submit-message' as const,
    chatId: 'unit-1',
    messageId: undefined,
    messages,
    abortSignal: undefined,
  };
}

async function collect(
  stream: ReadableStream<UIMessageChunk>,
): Promise<UIMessageChunk[]> {
  const chunks: UIMessageChunk[] = [];
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  return chunks;
}

function finishChunk(chunks: UIMessageChunk[]) {
  return chunks.find(
    (c): c is Extract<UIMessageChunk, { type: 'finish' }> =>
      c.type === 'finish',
  );
}

const USAGE_49: WireUsage = {
  prompt_tokens: 7,
  completion_tokens: 42,
  total_tokens: 49,
};

describe('[G2] VariorumChatTransport — usage plumbing', () => {
  beforeEach(() => {
    storage.clear();
    seedStore([VERSION_ONE]);
  });

  it('opts the request into stream_options.include_usage', async () => {
    const { bodies, fetchImpl } = scriptedFetch([{ content: 'ok' }]);
    const transport = new VariorumChatTransport('unit-1', { fetchImpl });
    await collect(await transport.sendMessages(sendOptions([USER_HI])));

    expect(bodies[0]?.stream_options).toEqual({ include_usage: true });
  });

  it('carries the SSE usage payload as UsageMetadata on the finish chunk', async () => {
    const { fetchImpl } = scriptedFetch([{ content: 'ok' }], 'stop', USAGE_49);
    const transport = new VariorumChatTransport('unit-1', { fetchImpl });
    const chunks = await collect(
      await transport.sendMessages(sendOptions([USER_HI])),
    );

    expect(finishChunk(chunks)?.messageMetadata).toEqual({
      modelName: 'test-model',
      usage: { inputTokens: 7, outputTokens: 42, totalTokens: 49 },
    });
  });

  it('tags the metadata with the modelName of the version at call time', async () => {
    seedStore([
      VERSION_ONE,
      {
        name: 'linkml',
        version: 2,
        modelName: 'better-model',
        systemPrompt: 'SYSTEM-PROMPT-V2',
      },
    ]);
    const { fetchImpl } = scriptedFetch([{ content: 'ok' }], 'stop', USAGE_49);
    const transport = new VariorumChatTransport('unit-1', { fetchImpl });
    const chunks = await collect(
      await transport.sendMessages(sendOptions([USER_HI])),
    );

    const metadata = finishChunk(chunks)?.messageMetadata as {
      modelName: string;
    };
    expect(metadata.modelName).toBe('better-model');
  });

  it('still fails a length finish as truncation — and that request opted in too', async () => {
    const { bodies, fetchImpl } = scriptedFetch(
      [{ content: 'half a thought' }],
      FINISH_REASON_LENGTH,
      USAGE_49,
    );
    const transport = new VariorumChatTransport('unit-1', { fetchImpl });
    const chunks = await collect(
      await transport.sendMessages(sendOptions([USER_HI])),
    );

    expect(bodies[0]?.stream_options).toEqual({ include_usage: true });
    expect(chunks).toContainEqual({
      type: 'error',
      errorText: TRUNCATED_RESPONSE_MESSAGE,
    });
    // No finish chunk escapes, so no usage metadata ever settles.
    expect(finishChunk(chunks)).toBeUndefined();
  });
});

describe('[G2] finishUsageMetadata', () => {
  const usage = (fields: Partial<LanguageModelUsage>): LanguageModelUsage =>
    fields as LanguageModelUsage;

  const finishPart = (totalUsage: LanguageModelUsage) =>
    ({
      type: 'finish',
      finishReason: 'stop',
      rawFinishReason: 'stop',
      totalUsage,
    }) as TextStreamPart<ToolSet>;

  it('builds UsageMetadata from a finish part', () => {
    expect(
      finishUsageMetadata(
        finishPart(
          usage({ inputTokens: 7, outputTokens: 42, totalTokens: 49 }),
        ),
        'test-model',
      ),
    ).toEqual({
      modelName: 'test-model',
      usage: { inputTokens: 7, outputTokens: 42, totalTokens: 49 },
    });
  });

  it('returns undefined when the provider reported no usage numbers', () => {
    expect(
      finishUsageMetadata(
        finishPart(
          usage({
            inputTokens: undefined,
            outputTokens: undefined,
            totalTokens: undefined,
          }),
        ),
        'test-model',
      ),
    ).toBeUndefined();
  });

  it('returns undefined for non-finish parts', () => {
    const delta = {
      type: 'text-delta',
      id: 't1',
      text: 'hello',
    } as unknown as TextStreamPart<ToolSet>;
    expect(finishUsageMetadata(delta, 'test-model')).toBeUndefined();
  });
});
