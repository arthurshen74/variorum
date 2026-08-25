/**
 * [G1] The Anthropic Messages adapter on the wire (DESIGN.md "LLM
 * Provider Interface"): routing, the browser-access opt-in, x-api-key
 * and its absence, the mandatory cap and its default, topK through the
 * provider, and no openai-only splice — asserted through an injected
 * fetch against a scripted Messages endpoint.
 */
import { describe, expect, it } from 'vitest';
import { streamText } from 'ai';
import type { ConfigurationVersion } from '@/domain/types';
import type { ResolvedModel } from './adapter';
import {
  ANTHROPIC_BROWSER_HEADER,
  DEFAULT_MAX_OUTPUT_TOKENS,
  anthropicMessagesAdapter,
} from './anthropic-messages';

// A non-claude id: the provider's capability table passes everything
// through, so the adapter's own behavior is what shows on the wire.
const RESOLVED: ResolvedModel = {
  api: 'anthropic-messages',
  url: 'http://anthropic.local/v1',
  modelId: 'local-mock',
};

const FULL_VERSION: ConfigurationVersion = {
  name: 'linkml',
  version: 1,
  modelName: 'mock-handle',
  systemPrompt: 'SYSTEM',
  temperature: 0.7,
  topP: 0.9,
  topK: 40,
  reasoningEffort: 'high',
};

const MINIMAL_VERSION: ConfigurationVersion = {
  name: 'linkml',
  version: 1,
  modelName: 'mock-handle',
  systemPrompt: 'SYSTEM',
};

function anthropicSse(): string {
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
        usage: { input_tokens: 3, output_tokens: 1 },
      },
    },
    {
      type: 'content_block_start',
      index: 0,
      content_block: { type: 'text', text: '' },
    },
    {
      type: 'content_block_delta',
      index: 0,
      delta: { type: 'text_delta', text: 'ok' },
    },
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

type Captured = {
  url: string;
  headers: Headers;
  body: Record<string, unknown>;
};

function capturingFetch() {
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
    return new Response(anthropicSse(), {
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
    });
  }) as typeof fetch;
  return { calls, fetchImpl };
}

async function send(resolved: ResolvedModel, version: ConfigurationVersion) {
  const { calls, fetchImpl } = capturingFetch();
  const prepared = anthropicMessagesAdapter.prepareRequest(
    resolved,
    version,
    fetchImpl,
  );
  const result = streamText({
    model: prepared.model,
    prompt: 'hi',
    temperature: version.temperature,
    topP: version.topP,
    ...prepared.options,
    maxRetries: 0,
  });
  await result.text;
  expect(calls).toHaveLength(1);
  const call = calls[0];
  if (call === undefined) throw new Error('no request captured');
  return { call, prepared };
}

describe('[G1] anthropic-messages adapter on the wire', () => {
  it('routes to <url>/messages with the resolved modelId and the browser-access header on every request', async () => {
    const { call } = await send(RESOLVED, MINIMAL_VERSION);
    expect(call.url).toBe('http://anthropic.local/v1/messages');
    expect(call.body.model).toBe('local-mock');
    expect(call.headers.get(ANTHROPIC_BROWSER_HEADER)).toBe('true');
  });

  it('sends the resolved key as x-api-key; no key means no x-api-key header', async () => {
    const keyed = await send(
      { ...RESOLVED, apiKey: 'sk-ant-test' },
      MINIMAL_VERSION,
    );
    expect(keyed.call.headers.get('x-api-key')).toBe('sk-ant-test');

    const keyless = await send(RESOLVED, MINIMAL_VERSION);
    expect(keyless.call.headers.has('x-api-key')).toBe(false);
  });

  it('options carry maxOutputTokens from the resolved model, DEFAULT_MAX_OUTPUT_TOKENS when absent, and topK from the version', async () => {
    const capped = await send(
      { ...RESOLVED, maxOutputTokens: 1234 },
      FULL_VERSION,
    );
    expect(capped.prepared.options).toEqual({
      maxOutputTokens: 1234,
      topK: 40,
    });
    expect(capped.call.body.max_tokens).toBe(1234);
    expect(capped.call.body.top_k).toBe(40);

    const defaulted = await send(RESOLVED, MINIMAL_VERSION);
    expect(defaulted.prepared.options).toEqual({
      maxOutputTokens: DEFAULT_MAX_OUTPUT_TOKENS,
    });
    expect(defaulted.call.body.max_tokens).toBe(DEFAULT_MAX_OUTPUT_TOKENS);
    expect(defaulted.call.body).not.toHaveProperty('top_k');
  });

  it('never splices openai-only fields — no reasoning_effort in the body', async () => {
    const { call } = await send(RESOLVED, FULL_VERSION);
    expect(call.body).not.toHaveProperty('reasoning_effort');
  });
});
