/**
 * [G2] Binding-driven routing (DESIGN.md "Model Bindings", "LLM Provider
 * Interface"): the transport resolves the model's binding at request
 * time and speaks that binding's protocol — endpoint URL, auth header,
 * and the Messages-only output cap, asserted on the wire through an
 * injected fetch. Filter by file — older manifests reuse the [G2] tag.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import type { UIMessage, UIMessageChunk } from 'ai';
import { VariorumChatTransport } from './chat-transport';
import {
  ANTHROPIC_BROWSER_HEADER,
  createModel,
} from './transport';
import {
  DEFAULT_MAX_OUTPUT_TOKENS,
  type ModelBinding,
} from './model-binding';
import { variorumStore } from '@/state/store';
import type { ConfigurationVersion } from '@/domain/types';

// node has no localStorage; bindings are read through it.
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

function seedStore(): void {
  variorumStore.setState({
    hydrated: true,
    configurations: [{ name: 'linkml', artifactType: 'yaml', archived: false }],
    configurationVersions: [VERSION_ONE],
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

function seedBinding(binding: ModelBinding, modelName = 'test-model'): void {
  storage.set(`variorum.model.${modelName}`, JSON.stringify(binding));
}

function openAiSse(): string {
  const chunk = (payload: Record<string, unknown>) =>
    `data: ${JSON.stringify({
      id: 'r1',
      object: 'chat.completion.chunk',
      created: 0,
      model: 'test-model',
      ...payload,
    })}\n\n`;
  return (
    chunk({ choices: [{ index: 0, delta: { content: 'ok' }, finish_reason: null }] }) +
    chunk({ choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] }) +
    'data: [DONE]\n\n'
  );
}

function anthropicSse(): string {
  const events: Record<string, unknown>[] = [
    {
      type: 'message_start',
      message: {
        id: 'msg_1',
        type: 'message',
        role: 'assistant',
        model: 'test-model',
        content: [],
        stop_reason: null,
        stop_sequence: null,
        usage: { input_tokens: 3, output_tokens: 1 },
      },
    },
    { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'ok' } },
    { type: 'content_block_stop', index: 0 },
    {
      type: 'message_delta',
      delta: { stop_reason: 'end_turn', stop_sequence: null },
      usage: { output_tokens: 2 },
    },
    { type: 'message_stop' },
  ];
  return events
    .map((e) => `event: ${String(e.type)}\ndata: ${JSON.stringify(e)}\n\n`)
    .join('');
}

type Captured = { url: string; headers: Headers; body: Record<string, unknown> };

function capturingFetch(sseBody: () => string) {
  const calls: Captured[] = [];
  const fetchImpl = (async (
    input: string | URL | Request,
    init?: RequestInit,
  ) => {
    calls.push({
      url: String(input),
      headers: new Headers(init?.headers),
      body: JSON.parse(String(init?.body)) as Record<string, unknown>,
    });
    return new Response(sseBody(), {
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

function sendOptions() {
  return {
    trigger: 'submit-message' as const,
    chatId: 'unit-1',
    messageId: undefined,
    messages: [USER_HI],
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

async function sendThrough(fetchImpl: typeof fetch): Promise<void> {
  const transport = new VariorumChatTransport('unit-1', { fetchImpl });
  await collect(await transport.sendMessages(sendOptions()));
}

function onlyCall(calls: Captured[]): Captured {
  expect(calls).toHaveLength(1);
  const call = calls[0];
  if (call === undefined) throw new Error('no request captured');
  return call;
}

describe('[G2] openai-compatible bindings on the wire', () => {
  beforeEach(() => {
    storage.clear();
    seedStore();
  });

  it('routes the request to the binding endpoint and sends no max_tokens', async () => {
    seedBinding({ api: 'openai-compatible', endpointUrl: 'http://box:9999/v1' });
    const { calls, fetchImpl } = capturingFetch(openAiSse);
    await sendThrough(fetchImpl);

    const call = onlyCall(calls);
    expect(call.url).toBe('http://box:9999/v1/chat/completions');
    expect('max_tokens' in call.body).toBe(false);
  });

  it('sends the binding key as a Bearer Authorization header', async () => {
    seedBinding({
      api: 'openai-compatible',
      endpointUrl: 'http://box:9999/v1',
      apiKey: 'sk-test',
    });
    const { calls, fetchImpl } = capturingFetch(openAiSse);
    await sendThrough(fetchImpl);

    const call = onlyCall(calls);
    expect(call.url).toBe('http://box:9999/v1/chat/completions');
    expect(call.headers.get('authorization')).toBe('Bearer sk-test');
  });

  it('sends no Authorization header when the binding has no key', async () => {
    seedBinding({ api: 'openai-compatible', endpointUrl: 'http://box:9999/v1' });
    const { calls, fetchImpl } = capturingFetch(openAiSse);
    await sendThrough(fetchImpl);

    const call = onlyCall(calls);
    expect(call.url).toBe('http://box:9999/v1/chat/completions');
    expect(call.headers.has('authorization')).toBe(false);
  });
});

describe('[G2] anthropic-messages bindings on the wire', () => {
  beforeEach(() => {
    storage.clear();
    seedStore();
  });

  it('routes the request to <endpointUrl>/messages', async () => {
    seedBinding({ api: 'anthropic-messages', endpointUrl: 'http://box:8080/v1' });
    const { calls, fetchImpl } = capturingFetch(anthropicSse);
    await sendThrough(fetchImpl);

    expect(onlyCall(calls).url).toBe('http://box:8080/v1/messages');
  });

  it('sends the binding key as x-api-key; no key means no x-api-key header', async () => {
    seedBinding({
      api: 'anthropic-messages',
      endpointUrl: 'http://box:8080/v1',
      apiKey: 'sk-ant-test',
    });
    const withKey = capturingFetch(anthropicSse);
    await sendThrough(withKey.fetchImpl);
    expect(onlyCall(withKey.calls).headers.get('x-api-key')).toBe('sk-ant-test');

    storage.clear();
    seedBinding({ api: 'anthropic-messages', endpointUrl: 'http://box:8080/v1' });
    const withoutKey = capturingFetch(anthropicSse);
    await sendThrough(withoutKey.fetchImpl);
    expect(onlyCall(withoutKey.calls).headers.has('x-api-key')).toBe(false);
  });

  it('opts into browser-origin access on every request', async () => {
    seedBinding({ api: 'anthropic-messages', endpointUrl: 'http://box:8080/v1' });
    const { calls, fetchImpl } = capturingFetch(anthropicSse);
    await sendThrough(fetchImpl);

    expect(onlyCall(calls).headers.get(ANTHROPIC_BROWSER_HEADER)).toBe('true');
  });

  it('sends the binding maxOutputTokens as max_tokens', async () => {
    seedBinding({
      api: 'anthropic-messages',
      endpointUrl: 'http://box:8080/v1',
      maxOutputTokens: 4321,
    });
    const { calls, fetchImpl } = capturingFetch(anthropicSse);
    await sendThrough(fetchImpl);

    expect(onlyCall(calls).body.max_tokens).toBe(4321);
  });

  it('defaults max_tokens when the binding omits maxOutputTokens', async () => {
    seedBinding({ api: 'anthropic-messages', endpointUrl: 'http://box:8080/v1' });
    const { calls, fetchImpl } = capturingFetch(anthropicSse);
    await sendThrough(fetchImpl);

    expect(onlyCall(calls).body.max_tokens).toBe(DEFAULT_MAX_OUTPUT_TOKENS);
  });
});

describe('[G2] binding resolution at request time', () => {
  beforeEach(() => {
    storage.clear();
    seedStore();
  });

  it('a rebinding between sends routes the next request to the new endpoint and protocol', async () => {
    const bodies: string[] = [openAiSse(), anthropicSse()];
    const calls: Captured[] = [];
    const fetchImpl = (async (
      input: string | URL | Request,
      init?: RequestInit,
    ) => {
      calls.push({
        url: String(input),
        headers: new Headers(init?.headers),
        body: JSON.parse(String(init?.body)) as Record<string, unknown>,
      });
      return new Response(bodies[calls.length - 1], {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      });
    }) as typeof fetch;

    const transport = new VariorumChatTransport('unit-1', { fetchImpl });
    await collect(await transport.sendMessages(sendOptions()));
    expect(calls[0]?.url).toBe('http://localhost:1234/v1/chat/completions');

    seedBinding({ api: 'anthropic-messages', endpointUrl: 'http://moved:7777/v1' });
    await collect(await transport.sendMessages(sendOptions()));
    expect(calls[1]?.url).toBe('http://moved:7777/v1/messages');
  });
});

describe('[G2] createModel', () => {
  it('constructs a model for both protocols', () => {
    // The binding parse boundary guarantees the discriminator; createModel
    // trusts it. This pins only that both known protocols construct.
    expect(() =>
      createModel(
        { api: 'openai-compatible', endpointUrl: 'http://x/v1' },
        'm',
      ),
    ).not.toThrow();
    expect(() =>
      createModel(
        { api: 'anthropic-messages', endpointUrl: 'http://x/v1' },
        'm',
      ),
    ).not.toThrow();
  });
});
