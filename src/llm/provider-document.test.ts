/**
 * [G2] The Models/Providers document (DESIGN.md "Models and Providers"):
 * the boundary validator over stored JSON — shape, types, every
 * uniqueness rule — and the read/write/seed path through localStorage,
 * including the legacy fold on first read and the no-silent-reset rule
 * for a malformed document.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { installLocalStorageStub } from './local-storage-stub';
import {
  DEFAULT_ENDPOINT_URL,
  PROVIDER_DOCUMENT_KEY,
  ProviderDocumentError,
  normalizeApiKey,
  parseEndpointUrl,
  parseProviderDocument,
  readProviderDocument,
  writeProviderDocument,
  type Endpoint,
  type ProviderDocument,
} from './provider-document';

const storage = installLocalStorageStub();

function endpoint(overrides: Partial<Endpoint> = {}): Endpoint {
  return {
    id: 'ep-1',
    url: 'http://host:1/v1',
    api: 'openai-compatible',
    authRequired: false,
    models: [],
    ...overrides,
  };
}

const FULL: ProviderDocument = {
  endpoints: [
    {
      id: 'ep-1',
      url: 'http://host:1/v1',
      api: 'openai-compatible',
      authRequired: true,
      apiKey: 'endpoint-key',
      models: [
        { modelName: 'qwen/qwen3-14b', handle: 'qwen-local' },
        {
          modelName: 'meta/llama',
          handle: 'llama',
          apiKey: 'model-key',
          maxOutputTokens: 2048,
        },
      ],
    },
    {
      id: 'ep-2',
      url: 'http://host:1/v1',
      api: 'anthropic-messages',
      authRequired: false,
      models: [
        { modelName: 'claude-x', handle: 'claude', maxOutputTokens: 8000 },
      ],
    },
  ],
};

function expectRejects(value: unknown, reason: RegExp | string): void {
  const raw = typeof value === 'string' ? value : JSON.stringify(value);
  expect(() => parseProviderDocument(raw)).toThrow(ProviderDocumentError);
  expect(() => parseProviderDocument(raw)).toThrow(PROVIDER_DOCUMENT_KEY);
  expect(() => parseProviderDocument(raw)).toThrow(reason);
}

describe('[G2] parseProviderDocument', () => {
  it('accepts a full document, rebuilt field by field, dropping unknown extras', () => {
    const withExtras = {
      endpoints: [
        { ...FULL.endpoints[0], extra: 'x' },
        {
          ...FULL.endpoints[1],
          models: [{ ...FULL.endpoints[1]?.models[0], stray: true }],
        },
      ],
      trailing: 1,
    };
    expect(parseProviderDocument(JSON.stringify(withExtras))).toEqual(FULL);
  });

  it('accepts an endpoint with no models or key and a model with neither key nor cap', () => {
    const minimal: ProviderDocument = {
      endpoints: [
        endpoint(),
        endpoint({
          id: 'ep-2',
          url: 'http://host:2/v1',
          models: [{ modelName: 'm', handle: 'm' }],
        }),
      ],
    };
    expect(parseProviderDocument(JSON.stringify(minimal))).toEqual(minimal);
  });

  it('accepts two endpoints sharing a URL under different protocols', () => {
    const shared: ProviderDocument = {
      endpoints: [
        endpoint({ id: 'a', api: 'openai-compatible' }),
        endpoint({ id: 'b', api: 'anthropic-messages' }),
      ],
    };
    expect(parseProviderDocument(JSON.stringify(shared))).toEqual(shared);
  });

  it('rejects non-JSON and non-object roots with a ProviderDocumentError naming variorum.llm', () => {
    expectRejects('{not json', /JSON/);
    expectRejects('null', /object/);
    expectRejects('"text"', /object/);
    expectRejects('[]', /endpoints/);
    expectRejects({}, /endpoints/);
    expectRejects({ endpoints: 'nope' }, /endpoints/);
  });

  it('rejects an unknown api id (a vendor name)', () => {
    expectRejects(
      { endpoints: [endpoint({ api: 'lm-studio' as never })] },
      /api/,
    );
    expectRejects(
      { endpoints: [endpoint({ api: 'openai-responses' as never })] },
      /api/,
    );
  });

  it('rejects wrong field types on endpoint and model', () => {
    expectRejects({ endpoints: [{ ...endpoint(), id: 7 }] }, /id/);
    expectRejects({ endpoints: [{ ...endpoint(), url: 9 }] }, /url/);
    expectRejects(
      { endpoints: [{ ...endpoint(), authRequired: 'yes' }] },
      /authRequired/,
    );
    expectRejects({ endpoints: [{ ...endpoint(), apiKey: 5 }] }, /apiKey/);
    expectRejects({ endpoints: [{ ...endpoint(), models: {} }] }, /models/);
    expectRejects(
      {
        endpoints: [
          endpoint({ models: [{ modelName: 1, handle: 'h' } as never] }),
        ],
      },
      /modelName/,
    );
    expectRejects(
      {
        endpoints: [
          endpoint({ models: [{ modelName: 'm', handle: 2 } as never] }),
        ],
      },
      /handle/,
    );
    expectRejects(
      {
        endpoints: [
          endpoint({
            models: [{ modelName: 'm', handle: 'h', apiKey: 3 } as never],
          }),
        ],
      },
      /apiKey/,
    );
    expectRejects(
      {
        endpoints: [
          endpoint({
            models: [
              { modelName: 'm', handle: 'h', maxOutputTokens: '8' } as never,
            ],
          }),
        ],
      },
      /maxOutputTokens/,
    );
  });

  it('rejects an unparseable or non-http(s) url', () => {
    expectRejects({ endpoints: [endpoint({ url: 'not a url' })] }, /url/);
    expectRejects({ endpoints: [endpoint({ url: 'ftp://host/v1' })] }, /url/);
    expectRejects({ endpoints: [endpoint({ url: '' })] }, /url/);
  });

  it('rejects a duplicate (url, api) pair', () => {
    expectRejects(
      { endpoints: [endpoint({ id: 'a' }), endpoint({ id: 'b' })] },
      /url/,
    );
  });

  it('rejects a duplicate handle across endpoints', () => {
    expectRejects(
      {
        endpoints: [
          endpoint({ id: 'a', models: [{ modelName: 'x', handle: 'same' }] }),
          endpoint({
            id: 'b',
            url: 'http://host:2/v1',
            models: [{ modelName: 'y', handle: 'same' }],
          }),
        ],
      },
      /handle/,
    );
  });

  it('rejects a duplicate modelName within an endpoint, allows it across endpoints under distinct handles', () => {
    expectRejects(
      {
        endpoints: [
          endpoint({
            models: [
              { modelName: 'x', handle: 'x-1' },
              { modelName: 'x', handle: 'x-2' },
            ],
          }),
        ],
      },
      /modelName/,
    );

    const across: ProviderDocument = {
      endpoints: [
        endpoint({ id: 'a', models: [{ modelName: 'x', handle: 'x-local' }] }),
        endpoint({
          id: 'b',
          url: 'http://host:2/v1',
          models: [{ modelName: 'x', handle: 'x-remote' }],
        }),
      ],
    };
    expect(parseProviderDocument(JSON.stringify(across))).toEqual(across);
  });

  it('rejects an empty or whitespace handle, modelName, or id', () => {
    expectRejects({ endpoints: [endpoint({ id: '' })] }, /id/);
    expectRejects({ endpoints: [endpoint({ id: '   ' })] }, /id/);
    expectRejects(
      { endpoints: [endpoint({ models: [{ modelName: '', handle: 'h' }] })] },
      /modelName/,
    );
    expectRejects(
      { endpoints: [endpoint({ models: [{ modelName: 'm', handle: ' ' }] })] },
      /handle/,
    );
  });
});

describe('[G2] readProviderDocument / writeProviderDocument', () => {
  beforeEach(() => {
    storage.clear();
  });

  it('write round-trips through localStorage under variorum.llm', () => {
    writeProviderDocument(FULL);
    const raw = storage.get(PROVIDER_DOCUMENT_KEY);
    expect(raw).toBeDefined();
    expect(JSON.parse(raw ?? '')).toEqual(FULL);
    expect(readProviderDocument()).toEqual(FULL);
  });

  it('read on an absent key seeds one LM Studio endpoint with no models and writes it', () => {
    const document = readProviderDocument();
    expect(document.endpoints).toHaveLength(1);
    const seed = document.endpoints[0];
    expect(seed).toMatchObject({
      url: DEFAULT_ENDPOINT_URL,
      api: 'openai-compatible',
      authRequired: false,
      models: [],
    });
    expect(seed).not.toHaveProperty('apiKey');
    expect(typeof seed?.id).toBe('string');
    expect(seed?.id.trim()).not.toBe('');

    const raw = storage.get(PROVIDER_DOCUMENT_KEY);
    expect(raw).toBeDefined();
    expect(JSON.parse(raw ?? '')).toEqual(document);
    // A second read returns the written document, not a fresh seed.
    expect(readProviderDocument()).toEqual(document);
  });

  it('read on an absent key with legacy records folds them and removes the legacy keys', () => {
    storage.set(
      'variorum.model.claude-mock',
      JSON.stringify({
        api: 'anthropic-messages',
        endpointUrl: 'http://127.0.0.1:8899/v1',
        apiKey: 'sk-ant-test',
        maxOutputTokens: 1234,
      }),
    );
    storage.set(
      'variorum.model.qwen',
      JSON.stringify({
        api: 'openai-compatible',
        endpointUrl: DEFAULT_ENDPOINT_URL,
      }),
    );

    const document = readProviderDocument();
    const anthropic = document.endpoints.find(
      (e) => e.api === 'anthropic-messages',
    );
    expect(anthropic).toMatchObject({
      url: 'http://127.0.0.1:8899/v1',
      authRequired: true,
      apiKey: 'sk-ant-test',
      models: [
        {
          modelName: 'claude-mock',
          handle: 'claude-mock',
          maxOutputTokens: 1234,
        },
      ],
    });
    const lmStudio = document.endpoints.filter(
      (e) => e.url === DEFAULT_ENDPOINT_URL,
    );
    expect(lmStudio).toHaveLength(1);
    expect(lmStudio[0]?.models).toEqual([
      { modelName: 'qwen', handle: 'qwen' },
    ]);

    expect(storage.has('variorum.model.claude-mock')).toBe(false);
    expect(storage.has('variorum.model.qwen')).toBe(false);
    expect(JSON.parse(storage.get(PROVIDER_DOCUMENT_KEY) ?? '')).toEqual(
      document,
    );
  });

  it('read on a malformed document throws and leaves the stored value untouched', () => {
    storage.set(PROVIDER_DOCUMENT_KEY, '{not json');
    expect(() => readProviderDocument()).toThrow(ProviderDocumentError);
    expect(storage.get(PROVIDER_DOCUMENT_KEY)).toBe('{not json');

    const duplicateHandle = JSON.stringify({
      endpoints: [
        endpoint({ id: 'a', models: [{ modelName: 'x', handle: 'h' }] }),
        endpoint({
          id: 'b',
          url: 'http://host:2/v1',
          models: [{ modelName: 'y', handle: 'h' }],
        }),
      ],
    });
    storage.set(PROVIDER_DOCUMENT_KEY, duplicateHandle);
    expect(() => readProviderDocument()).toThrow(ProviderDocumentError);
    expect(storage.get(PROVIDER_DOCUMENT_KEY)).toBe(duplicateHandle);
  });

  it('read ignores variorum.baseUrl and variorum.apiKey', () => {
    storage.set('variorum.baseUrl', 'http://legacy:9/v1');
    storage.set('variorum.apiKey', 'legacy-key');
    const document = readProviderDocument();
    expect(document.endpoints).toHaveLength(1);
    expect(document.endpoints[0]?.url).toBe(DEFAULT_ENDPOINT_URL);
    expect(JSON.stringify(document)).not.toContain('legacy');
    expect(storage.get('variorum.baseUrl')).toBe('http://legacy:9/v1');
  });
});

describe('[G2] parseEndpointUrl', () => {
  it('accepts http(s) trimmed; rejects non-URLs, other schemes, empty', () => {
    expect(parseEndpointUrl('http://localhost:1234/v1')).toBe(
      'http://localhost:1234/v1',
    );
    expect(parseEndpointUrl('  https://api.example.com/v1  ')).toBe(
      'https://api.example.com/v1',
    );
    expect(parseEndpointUrl('not a url')).toBeNull();
    expect(parseEndpointUrl('ftp://host/v1')).toBeNull();
    expect(parseEndpointUrl('file:///etc/passwd')).toBeNull();
    expect(parseEndpointUrl('')).toBeNull();
    expect(parseEndpointUrl('   ')).toBeNull();
  });
});

describe('[G2] normalizeApiKey', () => {
  it('trims; empty and whitespace-only are null', () => {
    expect(normalizeApiKey('  sk-test ')).toBe('sk-test');
    expect(normalizeApiKey('')).toBeNull();
    expect(normalizeApiKey('   ')).toBeNull();
  });
});
