/**
 * [G3] VariorumChatTransport (DESIGN.md "Chat"): request assembly from
 * the LATEST SAVED configuration version at call time, the
 * reasoning-never-resent rule on the wire, SSE decoding into UI message
 * chunks, and abort plumbing — all through an injected fetch against a
 * scripted endpoint. The body assertions are the wire contract LM Studio
 * sees: top_k and reasoning_effort must reach the request even though
 * the SDK provider does not send them natively.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import type { UIMessage, UIMessageChunk } from 'ai';
import {
  FINISH_REASON_LENGTH,
  TRUNCATED_RESPONSE_MESSAGE,
  VariorumChatTransport,
  failOnTruncation,
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
  temperature: 0.7,
  topP: 0.9,
  topK: 40,
  reasoningEffort: 'high',
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

type Captured = {
  url: string;
  body: Record<string, unknown>;
  signal: AbortSignal | undefined;
};

function sseBody(deltas: Record<string, unknown>[], finish = 'stop'): string {
  const events = [
    ...deltas.map((delta) =>
      JSON.stringify({
        id: 'r1',
        object: 'chat.completion.chunk',
        created: 0,
        model: 'test-model',
        choices: [{ index: 0, delta, finish_reason: null }],
      }),
    ),
    JSON.stringify({
      id: 'r1',
      object: 'chat.completion.chunk',
      created: 0,
      model: 'test-model',
      choices: [{ index: 0, delta: {}, finish_reason: finish }],
    }),
  ];
  return events.map((e) => `data: ${e}\n\n`).join('') + 'data: [DONE]\n\n';
}

function scriptedFetch(deltas: Record<string, unknown>[], finish = 'stop') {
  const calls: Captured[] = [];
  const fetchImpl = (async (
    input: string | URL | Request,
    init?: RequestInit,
  ) => {
    calls.push({
      url: String(input),
      body: JSON.parse(String(init?.body)) as Record<string, unknown>,
      signal: init?.signal ?? undefined,
    });
    return new Response(sseBody(deltas, finish), {
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
    });
  }) as typeof fetch;
  return { calls, fetchImpl };
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

describe('[G3] VariorumChatTransport', () => {
  beforeEach(() => {
    storage.clear();
    seedStore([VERSION_ONE]);
  });

  it('builds the request from the configuration version: model, system prompt, sampling, reasoning effort', async () => {
    const { calls, fetchImpl } = scriptedFetch([{ content: 'ok' }]);
    const transport = new VariorumChatTransport('unit-1', { fetchImpl });
    await collect(await transport.sendMessages(sendOptions([USER_HI])));

    expect(calls).toHaveLength(1);
    const call = calls[0];
    if (call === undefined) throw new Error('no request captured');
    expect(call.url).toContain('http://localhost:1234/v1');
    expect(call.url).toContain('/chat/completions');
    expect(call.body.model).toBe('test-model');
    const messages = call.body.messages as { role: string; content: unknown }[];
    expect(messages[0]?.role).toBe('system');
    expect(JSON.stringify(messages[0])).toContain('SYSTEM-PROMPT-V1');
    expect(call.body.temperature).toBe(0.7);
    expect(call.body.top_p).toBe(0.9);
    expect(call.body.top_k).toBe(40);
    expect(call.body.reasoning_effort).toBe('high');
  });

  it('uses the latest SAVED version at call time — a save between sends changes the next request', async () => {
    const { calls, fetchImpl } = scriptedFetch([{ content: 'ok' }]);
    const transport = new VariorumChatTransport('unit-1', { fetchImpl });
    await collect(await transport.sendMessages(sendOptions([USER_HI])));

    seedStore([
      VERSION_ONE,
      {
        name: 'linkml',
        version: 2,
        modelName: 'better-model',
        systemPrompt: 'SYSTEM-PROMPT-V2',
      },
    ]);
    await collect(await transport.sendMessages(sendOptions([USER_HI])));

    expect(calls[1]?.body.model).toBe('better-model');
    expect(JSON.stringify(calls[1]?.body.messages)).toContain(
      'SYSTEM-PROMPT-V2',
    );
  });

  it('sends no reasoning content, ever', async () => {
    const { calls, fetchImpl } = scriptedFetch([{ content: 'ok' }]);
    const transport = new VariorumChatTransport('unit-1', { fetchImpl });
    const history: UIMessage[] = [
      USER_HI,
      {
        id: 'm2',
        role: 'assistant',
        parts: [
          { type: 'reasoning', text: 'NEVER-RESENT-CHAIN' },
          { type: 'text', text: 'hello' },
        ],
      },
      { id: 'm3', role: 'user', parts: [{ type: 'text', text: 'go on' }] },
    ];
    await collect(await transport.sendMessages(sendOptions(history)));

    expect(JSON.stringify(calls[0]?.body)).not.toContain('NEVER-RESENT-CHAIN');
  });

  it('decodes the SSE response into text deltas', async () => {
    const { fetchImpl } = scriptedFetch([
      { content: 'Hello ' },
      { content: 'world' },
    ]);
    const transport = new VariorumChatTransport('unit-1', { fetchImpl });
    const chunks = await collect(
      await transport.sendMessages(sendOptions([USER_HI])),
    );

    const text = chunks
      .filter(
        (c): c is Extract<UIMessageChunk, { type: 'text-delta' }> =>
          c.type === 'text-delta',
      )
      .map((c) => c.delta)
      .join('');
    expect(text).toBe('Hello world');
  });

  it('propagates the abort signal to fetch', async () => {
    const { calls, fetchImpl } = scriptedFetch([{ content: 'ok' }]);
    const transport = new VariorumChatTransport('unit-1', { fetchImpl });
    const controller = new AbortController();
    await collect(
      await transport.sendMessages({
        ...sendOptions([USER_HI]),
        abortSignal: controller.signal,
      }),
    );

    const captured = calls[0]?.signal;
    expect(captured).toBeDefined();
    expect(captured?.aborted).toBe(false);
    controller.abort();
    expect(captured?.aborted).toBe(true);
  });
});

/**
 * [G1] Truncation (DESIGN.md "Truncation discards, too"): a response the
 * server cut short is a FAILED request, not a completed one. The
 * transport is the only code that sees a finish reason, so it is the only
 * place that makes this call.
 */
function chunkStream(
  chunks: UIMessageChunk[],
): ReadableStream<UIMessageChunk> {
  return new ReadableStream<UIMessageChunk>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });
}

const HELLO_DELTA: UIMessageChunk = {
  type: 'text-delta',
  id: 't1',
  delta: 'Hello',
};

describe('[G1] failOnTruncation', () => {
  it('emits an error chunk when the finish reason is length', async () => {
    const chunks = await collect(
      failOnTruncation(
        chunkStream([
          { type: 'start' },
          HELLO_DELTA,
          { type: 'finish', finishReason: FINISH_REASON_LENGTH },
        ]),
      ),
    );

    expect(chunks).toContainEqual({
      type: 'error',
      errorText: TRUNCATED_RESPONSE_MESSAGE,
    });
  });

  it('drops the finish chunk on truncation', async () => {
    const chunks = await collect(
      failOnTruncation(
        chunkStream([
          { type: 'start' },
          HELLO_DELTA,
          { type: 'finish', finishReason: FINISH_REASON_LENGTH },
        ]),
      ),
    );

    // A finish chunk would finalize the message as a success, and the
    // partial would be persisted by ChatPane's onFinish.
    expect(chunks.some((chunk) => chunk.type === 'finish')).toBe(false);
  });

  it('passes a stop finish through unchanged', async () => {
    const source: UIMessageChunk[] = [
      { type: 'start' },
      HELLO_DELTA,
      { type: 'finish', finishReason: 'stop' },
    ];
    const chunks = await collect(failOnTruncation(chunkStream(source)));

    expect(chunks).toEqual(source);
  });

  it('passes text deltas through before the error', async () => {
    const chunks = await collect(
      failOnTruncation(
        chunkStream([
          { type: 'start' },
          HELLO_DELTA,
          { type: 'text-delta', id: 't1', delta: ' world' },
          { type: 'finish', finishReason: FINISH_REASON_LENGTH },
        ]),
      ),
    );

    const text = chunks
      .filter(
        (c): c is Extract<UIMessageChunk, { type: 'text-delta' }> =>
          c.type === 'text-delta',
      )
      .map((c) => c.delta)
      .join('');
    expect(text).toBe('Hello world');
    expect(chunks.at(-1)).toEqual({
      type: 'error',
      errorText: TRUNCATED_RESPONSE_MESSAGE,
    });
  });

  it('leaves finish reasons other than length untouched', async () => {
    const source: UIMessageChunk[] = [
      { type: 'start' },
      HELLO_DELTA,
      { type: 'finish', finishReason: 'content-filter' },
    ];
    const chunks = await collect(failOnTruncation(chunkStream(source)));

    expect(chunks).toEqual(source);
  });
});

describe('[G1] VariorumChatTransport — truncation', () => {
  beforeEach(() => {
    storage.clear();
    seedStore([VERSION_ONE]);
  });

  it('surfaces truncation reported by the endpoint as an error chunk', async () => {
    const { fetchImpl } = scriptedFetch(
      [{ content: 'half a thought' }],
      FINISH_REASON_LENGTH,
    );
    const transport = new VariorumChatTransport('unit-1', { fetchImpl });
    const chunks = await collect(
      await transport.sendMessages(sendOptions([USER_HI])),
    );

    expect(chunks).toContainEqual({
      type: 'error',
      errorText: TRUNCATED_RESPONSE_MESSAGE,
    });
    expect(chunks.some((chunk) => chunk.type === 'finish')).toBe(false);
  });
});
