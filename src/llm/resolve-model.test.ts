/**
 * [G2] Handle resolution (DESIGN.md "Models and Providers", "Resolution"
 * and "Keys"): handle → adapter input, the two request-time errors with
 * their exact messages, key precedence, and the authRequired=false rule.
 */
import { describe, expect, it } from 'vitest';
import type { Endpoint, ProviderDocument } from './provider-document';
import {
  MissingApiKeyError,
  UnboundModelError,
  resolveModel,
} from './resolve-model';

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

const DOCUMENT: ProviderDocument = {
  endpoints: [
    endpoint({
      id: 'ep-1',
      authRequired: true,
      apiKey: 'endpoint-key',
      models: [
        { modelName: 'qwen/qwen3-14b', handle: 'qwen-local' },
        { modelName: 'meta/llama', handle: 'llama', apiKey: 'model-key' },
        { modelName: 'bare', handle: 'bare-handle' },
      ],
    }),
    endpoint({
      id: 'ep-2',
      url: 'http://host:2/v1',
      api: 'anthropic-messages',
      authRequired: true,
      apiKey: 'ant-key',
      models: [
        { modelName: 'claude-x', handle: 'claude', maxOutputTokens: 8000 },
      ],
    }),
    endpoint({
      id: 'ep-4',
      url: 'http://host:4/v1',
      api: 'openai-compatible',
      authRequired: true,
      models: [{ modelName: 'nokey', handle: 'nokey' }],
    }),
    endpoint({
      id: 'ep-3',
      url: 'http://host:3/v1',
      api: 'openai-compatible',
      authRequired: false,
      apiKey: 'stale-endpoint-key',
      models: [
        { modelName: 'open', handle: 'open', apiKey: 'stale-model-key' },
        // A wire name equal to another endpoint's handle.
        { modelName: 'qwen-local', handle: 'decoy' },
      ],
    }),
  ],
};

describe('[G2] resolveModel', () => {
  it("resolves a handle to api, url, the row's modelName as modelId, and the cap", () => {
    expect(resolveModel(DOCUMENT, 'claude')).toEqual({
      api: 'anthropic-messages',
      url: 'http://host:2/v1',
      modelId: 'claude-x',
      maxOutputTokens: 8000,
      apiKey: 'ant-key',
    });
  });

  it('an unbound handle throws UnboundModelError with the exact message', () => {
    expect(() => resolveModel(DOCUMENT, 'ghost')).toThrow(UnboundModelError);
    expect(() => resolveModel(DOCUMENT, 'ghost')).toThrow(
      'no endpoint bound for model ghost, please check your models/providers configuration',
    );
    // The wire name is not a handle: a bare modelName does not resolve.
    expect(() => resolveModel(DOCUMENT, 'qwen/qwen3-14b')).toThrow(
      UnboundModelError,
    );
    expect(() => resolveModel({ endpoints: [] }, 'anything')).toThrow(
      UnboundModelError,
    );
  });

  it('authRequired: the model key wins over the endpoint key; the endpoint key serves a keyless model', () => {
    expect(resolveModel(DOCUMENT, 'llama')).toMatchObject({
      url: 'http://host:1/v1',
      modelId: 'meta/llama',
      apiKey: 'model-key',
    });
    expect(resolveModel(DOCUMENT, 'qwen-local')).toMatchObject({
      modelId: 'qwen/qwen3-14b',
      apiKey: 'endpoint-key',
    });
  });

  it('authRequired with neither key throws MissingApiKeyError with the exact message', () => {
    // 'nokey' sits under an auth-required endpoint with no key on either row.
    expect(() => resolveModel(DOCUMENT, 'nokey')).toThrow(MissingApiKeyError);
    expect(() => resolveModel(DOCUMENT, 'nokey')).toThrow(
      'no API key for model nokey: endpoint http://host:4/v1 requires authentication, please check your models/providers configuration',
    );
  });

  it('authRequired false yields no apiKey even when a stale key sits on the endpoint or model', () => {
    const resolved = resolveModel(DOCUMENT, 'open');
    expect(resolved.apiKey).toBeUndefined();
    expect(resolved).toMatchObject({
      url: 'http://host:3/v1',
      modelId: 'open',
    });
  });

  it("a handle equal to another endpoint's modelName resolves by handle, never by modelName", () => {
    expect(resolveModel(DOCUMENT, 'decoy')).toMatchObject({
      url: 'http://host:3/v1',
      modelId: 'qwen-local',
    });
    expect(resolveModel(DOCUMENT, 'qwen-local')).toMatchObject({
      url: 'http://host:1/v1',
      modelId: 'qwen/qwen3-14b',
    });
  });
});
