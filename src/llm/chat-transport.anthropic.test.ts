/**
 * [G2] The chat exchange over the Anthropic Messages protocol (DESIGN.md
 * "LLM Provider Interface", "Chat"): recipe fields on the Messages wire,
 * no reasoning knob ever sent, SSE decoding of text and thinking deltas,
 * truncation as a FAILED request, and terminal usage as UsageMetadata —
 * all through an injected fetch against a scripted Messages endpoint.
 * Filter by file — older manifests reuse the [G2] tag.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import type { UIMessage, UIMessageChunk } from 'ai';
import {
  TRUNCATED_RESPONSE_MESSAGE,
  VariorumChatTransport,
} from './chat-transport';
import type { ModelBinding } from './model-binding';
import { variorumStore } from '@/state/store';
import type { ConfigurationVersion } from '@/domain/types';

// node has no localStorage; bindings are read through it.
const storage = new Map<string, string>();
(globalThis as Record<string, unknown>).localStorage = {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => void storage.set(key, value),
  removeItem: (key: string) => void storage.delete(key),
};

const FULL_VERSION: ConfigurationVersion = {
  name: 'linkml',
  version: 1,
  modelName: 'local-mock',
  systemPrompt: 'SYSTEM-PROMPT-V1',
  temperature: 0.7,
  topP: 0.9,
  topK: 40,
  reasoningEffort: 'high',
};

const MINIMAL_VERSION: ConfigurationVersion = {
  name: 'linkml',
  version: 1,
  modelName: 'local-mock',
  systemPrompt: 'SYSTEM-PROMPT-V1',
};

function seedStore(version: ConfigurationVersion): void {
  variorumStore.setState({
    hydrated: true,
    configurations: [{ name: 'linkml', artifactType: 'yaml', archived: false }],
    configurationVersions: [version],
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

const BINDING: ModelBinding = {
  api: 'anthropic-messages',
  endpointUrl: 'http://anthropic.local/v1',
  apiKey: 'sk-ant-test',
};

function seedBinding(modelName = 'local-mock'): void {
  storage.set(`variorum.model.${modelName}`, JSON.stringify(BINDING));
}

/** The provider gates sampling by model id; each G4 case binds its own. */
function seedModel(modelName: string, version: ConfigurationVersion): void {
  seedBinding(modelName);
  seedStore({ ...version, modelName });
}

interface Script {
  thinking?: string[];
  text?: string[];
  stopReason?: string;
  inputTokens?: number;
  outputTokens?: number;
}

function anthropicSse(script: Script): string {
  const events: Record<string, unknown>[] = [
    {
      type: 'message_start',
      message: {
        id: 'msg_1',
        type: 'message',
        role: 'assistant',
        model: 'local-mock',
        content: [],
        stop_reason: null,
        stop_sequence: null,
        usage: { input_tokens: script.inputTokens ?? 3, output_tokens: 1 },
      },
    },
  ];
  let index = 0;
  if (script.thinking !== undefined) {
    events.push({
      type: 'content_block_start',
      index,
      content_block: { type: 'thinking', thinking: '' },
    });
    for (const thinking of script.thinking) {
      events.push({
        type: 'content_block_delta',
        index,
        delta: { type: 'thinking_delta', thinking },
      });
    }
    events.push({ type: 'content_block_stop', index });
    index += 1;
  }
  events.push({
    type: 'content_block_start',
    index,
    content_block: { type: 'text', text: '' },
  });
  for (const text of script.text ?? ['ok']) {
    events.push({
      type: 'content_block_delta',
      index,
      delta: { type: 'text_delta', text },
    });
  }
  events.push({ type: 'content_block_stop', index });
  events.push({
    type: 'message_delta',
    delta: { stop_reason: script.stopReason ?? 'end_turn', stop_sequence: null },
    usage: { output_tokens: script.outputTokens ?? 2 },
  });
  events.push({ type: 'message_stop' });
  return events
    .map((e) => `event: ${String(e.type)}\ndata: ${JSON.stringify(e)}\n\n`)
    .join('');
}

function scriptedFetch(script: Script) {
  const bodies: Record<string, unknown>[] = [];
  const fetchImpl = (async (
    input: string | URL | Request,
    init?: RequestInit,
  ) => {
    void input;
    bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    return new Response(anthropicSse(script), {
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

function sendOptions(messages: UIMessage[] = [USER_HI]) {
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

function deltasOf(chunks: UIMessageChunk[], type: 'text-delta' | 'reasoning-delta') {
  return chunks
    .filter(
      (c): c is Extract<UIMessageChunk, { type: 'text-delta' | 'reasoning-delta' }> =>
        c.type === type,
    )
    .map((c) => c.delta)
    .join('');
}

describe('[G2] VariorumChatTransport over Anthropic Messages', () => {
  beforeEach(() => {
    storage.clear();
    seedBinding();
  });

  it('carries the recipe on the Messages wire: model, system, sampling', async () => {
    seedStore(FULL_VERSION);
    const { bodies, fetchImpl } = scriptedFetch({ text: ['ok'] });
    const transport = new VariorumChatTransport('unit-1', { fetchImpl });
    await collect(await transport.sendMessages(sendOptions()));

    const body = bodies[0];
    if (body === undefined) throw new Error('no request captured');
    expect(body.model).toBe('local-mock');
    expect(JSON.stringify(body.system)).toContain('SYSTEM-PROMPT-V1');
    expect(body.temperature).toBe(0.7);
    expect(body.top_p).toBe(0.9);
    expect(body.top_k).toBe(40);
    const messages = body.messages as { role: string }[];
    expect(messages.at(-1)?.role).toBe('user');
  });

  it('omits unset sampling fields and openai-only wire fields', async () => {
    seedStore(MINIMAL_VERSION);
    const { bodies, fetchImpl } = scriptedFetch({ text: ['ok'] });
    const transport = new VariorumChatTransport('unit-1', { fetchImpl });
    await collect(await transport.sendMessages(sendOptions()));

    const body = bodies[0];
    if (body === undefined) throw new Error('no request captured');
    expect('temperature' in body).toBe(false);
    expect('top_p' in body).toBe(false);
    expect('top_k' in body).toBe(false);
    // The Messages API has no stream_options; usage needs no opt-in there.
    expect('stream_options' in body).toBe(false);
  });

  it('sends no reasoning knob even when the version sets reasoningEffort', async () => {
    seedStore(FULL_VERSION);
    const { bodies, fetchImpl } = scriptedFetch({ text: ['ok'] });
    const transport = new VariorumChatTransport('unit-1', { fetchImpl });
    await collect(await transport.sendMessages(sendOptions()));

    const body = bodies[0];
    if (body === undefined) throw new Error('no request captured');
    expect('thinking' in body).toBe(false);
    expect('reasoning_effort' in body).toBe(false);
  });

  it('decodes text deltas from the Messages stream', async () => {
    seedStore(MINIMAL_VERSION);
    const { fetchImpl } = scriptedFetch({ text: ['Hello ', 'world'] });
    const transport = new VariorumChatTransport('unit-1', { fetchImpl });
    const chunks = await collect(await transport.sendMessages(sendOptions()));

    expect(deltasOf(chunks, 'text-delta')).toBe('Hello world');
  });

  it('decodes thinking deltas as reasoning parts', async () => {
    seedStore(MINIMAL_VERSION);
    const { fetchImpl } = scriptedFetch({
      thinking: ['THINKING-', 'CONTENT'],
      text: ['ok'],
    });
    const transport = new VariorumChatTransport('unit-1', { fetchImpl });
    const chunks = await collect(await transport.sendMessages(sendOptions()));

    expect(deltasOf(chunks, 'reasoning-delta')).toBe('THINKING-CONTENT');
    expect(deltasOf(chunks, 'text-delta')).toBe('ok');
  });

  it('treats a max_tokens stop as a FAILED request — error chunk, no finish', async () => {
    seedStore(MINIMAL_VERSION);
    const { fetchImpl } = scriptedFetch({
      text: ['half a thought'],
      stopReason: 'max_tokens',
    });
    const transport = new VariorumChatTransport('unit-1', { fetchImpl });
    const chunks = await collect(await transport.sendMessages(sendOptions()));

    expect(chunks).toContainEqual({
      type: 'error',
      errorText: TRUNCATED_RESPONSE_MESSAGE,
    });
    expect(chunks.some((chunk) => chunk.type === 'finish')).toBe(false);
  });

  it('carries terminal usage as UsageMetadata on the finish chunk', async () => {
    seedStore(MINIMAL_VERSION);
    const { fetchImpl } = scriptedFetch({
      text: ['ok'],
      inputTokens: 7,
      outputTokens: 42,
    });
    const transport = new VariorumChatTransport('unit-1', { fetchImpl });
    const chunks = await collect(await transport.sendMessages(sendOptions()));

    const finish = chunks.find(
      (c): c is Extract<UIMessageChunk, { type: 'finish' }> =>
        c.type === 'finish',
    );
    expect(finish?.messageMetadata).toEqual({
      modelName: 'local-mock',
      usage: { inputTokens: 7, outputTokens: 42, totalTokens: 49 },
    });
  });
});

describe('[G4] sampling parameters are model-gated on the Messages wire', () => {
  beforeEach(() => {
    storage.clear();
  });

  async function requestBody(
    modelName: string,
    version: ConfigurationVersion,
  ): Promise<Record<string, unknown>> {
    seedModel(modelName, version);
    const { bodies, fetchImpl } = scriptedFetch({ text: ['ok'] });
    const transport = new VariorumChatTransport('unit-1', { fetchImpl });
    await collect(await transport.sendMessages(sendOptions()));
    const body = bodies[0];
    if (body === undefined) throw new Error('no request captured');
    return body;
  }

  it('strips temperature, top_p and top_k for a current-generation Claude id', async () => {
    const body = await requestBody('claude-sonnet-5', FULL_VERSION);
    expect('temperature' in body).toBe(false);
    expect('top_p' in body).toBe(false);
    expect('top_k' in body).toBe(false);
  });

  it('treats an unrecognized claude-* id as current-generation', async () => {
    const body = await requestBody('claude-mock', FULL_VERSION);
    expect('temperature' in body).toBe(false);
    expect('top_p' in body).toBe(false);
    expect('top_k' in body).toBe(false);
  });

  it('drops top_p but keeps temperature and top_k on a Claude 4.6 id', async () => {
    const body = await requestBody('claude-sonnet-4-6', FULL_VERSION);
    expect(body.temperature).toBe(0.7);
    expect(body.top_k).toBe(40);
    expect('top_p' in body).toBe(false);
  });

  it('sends top_p on a Claude 4.6 id when temperature is unset', async () => {
    const body = await requestBody('claude-sonnet-4-6', {
      ...MINIMAL_VERSION,
      topP: 0.9,
    });
    expect(body.top_p).toBe(0.9);
    expect('temperature' in body).toBe(false);
  });

  it('still sends the output cap and no reasoning knob on a stripped request', async () => {
    const body = await requestBody('claude-sonnet-5', FULL_VERSION);
    expect(typeof body.max_tokens).toBe('number');
    expect('thinking' in body).toBe(false);
    expect('reasoning_effort' in body).toBe(false);
  });
});
