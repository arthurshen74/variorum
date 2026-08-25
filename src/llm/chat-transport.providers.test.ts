/**
 * [G3] The chat transport over the Models/Providers document (DESIGN.md
 * "Models and Providers", "Chat"): resolution at call time, the two
 * request-time errors delivered as error chunks before any network, the
 * wire id versus the handle, and key precedence on the wire — through an
 * injected fetch against scripted endpoints of both protocols.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import type { UIMessage, UIMessageChunk } from 'ai';
import { VariorumChatTransport } from './chat-transport';
import { installLocalStorageStub } from './local-storage-stub';
import {
  PROVIDER_DOCUMENT_KEY,
  type ProviderDocument,
} from './provider-document';
import { variorumStore } from '@/state/store';
import type { ConfigurationVersion } from '@/domain/types';

const storage = installLocalStorageStub();

const UNBOUND_MESSAGE =
  'no endpoint bound for model test-handle, please check your models/providers configuration';
const MISSING_KEY_MESSAGE =
  'no API key for model test-handle: endpoint http://openai.local/v1 requires authentication, please check your models/providers configuration';

const VERSION: ConfigurationVersion = {
  name: 'linkml',
  version: 1,
  modelName: 'test-handle',
  systemPrompt: 'SYSTEM-PROMPT-V1',
};

function seedStore(): void {
  variorumStore.setState({
    hydrated: true,
    configurations: [{ name: 'linkml', artifactType: 'yaml', archived: false }],
    configurationVersions: [VERSION],
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

function seedDocument(document: ProviderDocument): void {
  storage.set(PROVIDER_DOCUMENT_KEY, JSON.stringify(document));
}

const OPENAI_DOCUMENT: ProviderDocument = {
  endpoints: [
    {
      id: 'ep-openai',
      url: 'http://openai.local/v1',
      api: 'openai-compatible',
      authRequired: false,
      models: [{ modelName: 'qwen/qwen3-14b', handle: 'test-handle' }],
    },
  ],
};

const ANTHROPIC_DOCUMENT: ProviderDocument = {
  endpoints: [
    {
      id: 'ep-anthropic',
      url: 'http://anthropic.local/v1',
      api: 'anthropic-messages',
      authRequired: true,
      apiKey: 'sk-ant-test',
      models: [
        {
          modelName: 'claude-mock',
          handle: 'test-handle',
          maxOutputTokens: 1234,
        },
      ],
    },
  ],
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

function anthropicSse(): string {
  const events: Record<string, unknown>[] = [
    {
      type: 'message_start',
      message: {
        id: 'msg_1',
        type: 'message',
        role: 'assistant',
        model: 'claude-mock',
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

/** Answers in whichever protocol the path names, so a mid-test rebinding works. */
function capturingFetch() {
  const calls: Captured[] = [];
  const fetchImpl = (async (
    input: string | URL | Request,
    init?: RequestInit,
  ) => {
    const url = String(input);
    calls.push({
      url,
      headers: new Headers(init?.headers),
      body: JSON.parse(String(init?.body)) as Record<string, unknown>,
    });
    return new Response(
      url.endsWith('/messages') ? anthropicSse() : openAiSse(),
      {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      },
    );
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

async function sendThrough(
  transport: VariorumChatTransport,
): Promise<UIMessageChunk[]> {
  return collect(await transport.sendMessages(sendOptions()));
}

describe('[G3] VariorumChatTransport resolves through the Models/Providers document', () => {
  beforeEach(() => {
    storage.clear();
    seedStore();
  });

  it('an unbound handle yields a stream whose only chunk is an error carrying the unbound message; fetch is never called', async () => {
    seedDocument({ endpoints: [] });
    const { calls, fetchImpl } = capturingFetch();
    const chunks = await sendThrough(
      new VariorumChatTransport('unit-1', { fetchImpl }),
    );
    expect(chunks).toEqual([{ type: 'error', errorText: UNBOUND_MESSAGE }]);
    expect(calls).toHaveLength(0);
  });

  it('a keyless model under an auth-required endpoint yields the missing-key error chunk; no fetch', async () => {
    seedDocument({
      endpoints: [
        { ...OPENAI_DOCUMENT.endpoints[0], authRequired: true } as never,
      ],
    });
    const { calls, fetchImpl } = capturingFetch();
    const chunks = await sendThrough(
      new VariorumChatTransport('unit-1', { fetchImpl }),
    );
    expect(chunks).toEqual([{ type: 'error', errorText: MISSING_KEY_MESSAGE }]);
    expect(calls).toHaveLength(0);
  });

  it('a malformed document yields an error chunk naming variorum.llm; no fetch', async () => {
    storage.set(PROVIDER_DOCUMENT_KEY, '{not json');
    const { calls, fetchImpl } = capturingFetch();
    const chunks = await sendThrough(
      new VariorumChatTransport('unit-1', { fetchImpl }),
    );
    expect(chunks).toHaveLength(1);
    const only = chunks[0];
    expect(only?.type).toBe('error');
    expect(only?.type === 'error' ? only.errorText : '').toContain(
      PROVIDER_DOCUMENT_KEY,
    );
    expect(calls).toHaveLength(0);
    expect(storage.get(PROVIDER_DOCUMENT_KEY)).toBe('{not json');
  });

  it('a document edit between sends routes the next request to the new endpoint and protocol', async () => {
    seedDocument(OPENAI_DOCUMENT);
    const { calls, fetchImpl } = capturingFetch();
    const transport = new VariorumChatTransport('unit-1', { fetchImpl });

    await sendThrough(transport);
    seedDocument(ANTHROPIC_DOCUMENT);
    await sendThrough(transport);

    expect(calls.map((c) => c.url)).toEqual([
      'http://openai.local/v1/chat/completions',
      'http://anthropic.local/v1/messages',
    ]);
    expect(calls[0]?.headers.has('authorization')).toBe(false);
    expect(calls[1]?.headers.get('x-api-key')).toBe('sk-ant-test');
    expect(calls[1]?.body.model).toBe('claude-mock');
    expect(calls[1]?.body.max_tokens).toBe(1234);
  });

  it("the wire model id is the row's modelName, not the handle", async () => {
    seedDocument(OPENAI_DOCUMENT);
    const { calls, fetchImpl } = capturingFetch();
    await sendThrough(new VariorumChatTransport('unit-1', { fetchImpl }));
    expect(calls[0]?.body.model).toBe('qwen/qwen3-14b');
    expect(JSON.stringify(calls[0]?.body)).not.toContain('test-handle');
  });

  it('a model key beats the endpoint key on the wire', async () => {
    seedDocument({
      endpoints: [
        {
          id: 'ep-openai',
          url: 'http://openai.local/v1',
          api: 'openai-compatible',
          authRequired: true,
          apiKey: 'endpoint-key',
          models: [
            {
              modelName: 'qwen/qwen3-14b',
              handle: 'test-handle',
              apiKey: 'model-key',
            },
          ],
        },
      ],
    });
    const { calls, fetchImpl } = capturingFetch();
    await sendThrough(new VariorumChatTransport('unit-1', { fetchImpl }));
    expect(calls[0]?.headers.get('authorization')).toBe('Bearer model-key');
  });
});
