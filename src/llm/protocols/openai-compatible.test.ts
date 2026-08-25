/**
 * [G1] The OpenAI-compatible adapter on the wire (DESIGN.md "LLM Provider
 * Interface"): routing, the Bearer header and its absence, the body
 * splice for top_k / reasoning_effort, and no cap — asserted through an
 * injected fetch against a scripted chat-completions endpoint.
 */
import { describe, expect, it } from 'vitest';
import { streamText } from 'ai';
import type { ConfigurationVersion } from '@/domain/types';
import type { ResolvedModel } from './adapter';
import { openAiCompatibleAdapter } from './openai-compatible';

const RESOLVED: ResolvedModel = {
  api: 'openai-compatible',
  url: 'http://openai.local/v1',
  modelId: 'qwen/qwen3-14b',
};

const FULL_VERSION: ConfigurationVersion = {
  name: 'linkml',
  version: 1,
  modelName: 'qwen-handle',
  systemPrompt: 'SYSTEM',
  temperature: 0.7,
  topP: 0.9,
  topK: 40,
  reasoningEffort: 'high',
};

const MINIMAL_VERSION: ConfigurationVersion = {
  name: 'linkml',
  version: 1,
  modelName: 'qwen-handle',
  systemPrompt: 'SYSTEM',
};

function openAiSse(): string {
  const chunk = (payload: Record<string, unknown>) =>
    `data: ${JSON.stringify({
      id: 'r1',
      object: 'chat.completion.chunk',
      created: 0,
      model: 'qwen/qwen3-14b',
      ...payload,
    })}\n\n`;
  return (
    chunk({
      choices: [{ index: 0, delta: { content: 'ok' }, finish_reason: null }],
    }) +
    chunk({ choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] }) +
    'data: [DONE]\n\n'
  );
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
    return new Response(openAiSse(), {
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
    });
  }) as typeof fetch;
  return { calls, fetchImpl };
}

/** Runs one streamText through the prepared request, the way the transport does. */
async function send(resolved: ResolvedModel, version: ConfigurationVersion) {
  const { calls, fetchImpl } = capturingFetch();
  const prepared = openAiCompatibleAdapter.prepareRequest(
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

describe('[G1] openai-compatible adapter on the wire', () => {
  it('routes to <url>/chat/completions with the resolved modelId and sends no max_tokens', async () => {
    const { call } = await send(RESOLVED, MINIMAL_VERSION);
    expect(call.url).toBe('http://openai.local/v1/chat/completions');
    expect(call.body.model).toBe('qwen/qwen3-14b');
    expect(call.body).not.toHaveProperty('max_tokens');
    expect(call.body).not.toHaveProperty('max_completion_tokens');
  });

  it('sends the resolved key as Bearer Authorization; no key means no Authorization header', async () => {
    const keyed = await send(
      { ...RESOLVED, apiKey: 'sk-open-test' },
      MINIMAL_VERSION,
    );
    expect(keyed.call.headers.get('authorization')).toBe('Bearer sk-open-test');

    const keyless = await send(RESOLVED, MINIMAL_VERSION);
    expect(keyless.call.headers.has('authorization')).toBe(false);
  });

  it('splices top_k and reasoning_effort from the version into the body; omits them when unset', async () => {
    const full = await send(RESOLVED, FULL_VERSION);
    expect(full.call.body.top_k).toBe(40);
    expect(full.call.body.reasoning_effort).toBe('high');
    expect(full.call.body.temperature).toBe(0.7);
    expect(full.call.body.top_p).toBe(0.9);

    const minimal = await send(RESOLVED, MINIMAL_VERSION);
    expect(minimal.call.body).not.toHaveProperty('top_k');
    expect(minimal.call.body).not.toHaveProperty('reasoning_effort');
  });

  it('returns no streamText options — cap and topK never ride the openai path', async () => {
    const { prepared } = await send(
      { ...RESOLVED, maxOutputTokens: 500 },
      FULL_VERSION,
    );
    expect(prepared.options).toEqual({});
  });
});
