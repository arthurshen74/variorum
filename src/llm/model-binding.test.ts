/**
 * [G1] Model bindings (DESIGN.md "Model Bindings"): the localStorage
 * contract under `variorum.model.<modelName>` — parse boundary, default
 * semantics, per-model isolation, dead legacy keys — plus the ported
 * endpoint-URL and API-key normalization boundaries. Filter by file —
 * older manifests reuse the [G1] tag.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_BASE_URL,
  DEFAULT_BINDING,
  clearModelBinding,
  getModelBinding,
  hasStoredBinding,
  normalizeApiKey,
  parseEndpointUrl,
  parseModelBinding,
  setModelBinding,
  type ModelBinding,
} from './model-binding';

// node has no localStorage; the binding module reads and writes through it.
const storage = new Map<string, string>();
(globalThis as Record<string, unknown>).localStorage = {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => void storage.set(key, value),
  removeItem: (key: string) => void storage.delete(key),
};

const ANTHROPIC_BINDING: ModelBinding = {
  api: 'anthropic-messages',
  endpointUrl: 'https://api.anthropic.com/v1',
  apiKey: 'sk-ant-test',
  maxOutputTokens: 8000,
};

beforeEach(() => {
  storage.clear();
});

describe('[G1] parseModelBinding', () => {
  it('accepts a full record', () => {
    expect(parseModelBinding(JSON.stringify(ANTHROPIC_BINDING))).toEqual(
      ANTHROPIC_BINDING,
    );
  });

  it('accepts a minimal record — api and endpointUrl only', () => {
    const minimal = {
      api: 'openai-compatible',
      endpointUrl: 'http://localhost:1234/v1',
    };
    expect(parseModelBinding(JSON.stringify(minimal))).toEqual(minimal);
  });

  it('rejects text that is not JSON', () => {
    expect(parseModelBinding('not json')).toBeNull();
  });

  it('rejects an unknown api discriminator', () => {
    expect(
      parseModelBinding(
        JSON.stringify({ api: 'grpc', endpointUrl: 'http://x/v1' }),
      ),
    ).toBeNull();
  });

  it('rejects a missing or non-string endpointUrl', () => {
    expect(
      parseModelBinding(JSON.stringify({ api: 'openai-compatible' })),
    ).toBeNull();
    expect(
      parseModelBinding(
        JSON.stringify({ api: 'openai-compatible', endpointUrl: 5 }),
      ),
    ).toBeNull();
  });

  it('rejects a non-string apiKey and a non-number maxOutputTokens', () => {
    expect(
      parseModelBinding(
        JSON.stringify({
          api: 'openai-compatible',
          endpointUrl: 'http://x/v1',
          apiKey: 5,
        }),
      ),
    ).toBeNull();
    expect(
      parseModelBinding(
        JSON.stringify({
          api: 'anthropic-messages',
          endpointUrl: 'http://x/v1',
          maxOutputTokens: 'big',
        }),
      ),
    ).toBeNull();
  });
});

describe('[G1] getModelBinding', () => {
  it('returns the stored binding for its model name', () => {
    storage.set('variorum.model.claude-mock', JSON.stringify(ANTHROPIC_BINDING));
    expect(getModelBinding('claude-mock')).toEqual(ANTHROPIC_BINDING);
  });

  it('returns the default when nothing is stored', () => {
    expect(getModelBinding('unbound-model')).toEqual(DEFAULT_BINDING);
    expect(DEFAULT_BINDING.endpointUrl).toBe(DEFAULT_BASE_URL);
    expect(DEFAULT_BINDING.api).toBe('openai-compatible');
    expect(DEFAULT_BINDING.apiKey).toBeUndefined();
  });

  it('returns the default when the stored value is malformed', () => {
    storage.set('variorum.model.broken', '{oops');
    expect(getModelBinding('broken')).toEqual(DEFAULT_BINDING);
  });

  it('ignores the legacy global variorum.baseUrl and variorum.apiKey keys', () => {
    storage.set('variorum.baseUrl', 'http://elsewhere:9999/v1');
    storage.set('variorum.apiKey', 'legacy-key');
    expect(getModelBinding('any-model')).toEqual(DEFAULT_BINDING);
  });
});

describe('[G1] setModelBinding / clearModelBinding / hasStoredBinding', () => {
  it('stores under variorum.model.<name> and round-trips', () => {
    setModelBinding('claude-mock', ANTHROPIC_BINDING);
    const raw = storage.get('variorum.model.claude-mock');
    expect(raw).toBeDefined();
    expect(JSON.parse(raw as string)).toEqual(ANTHROPIC_BINDING);
    expect(getModelBinding('claude-mock')).toEqual(ANTHROPIC_BINDING);
  });

  it('bindings are per model — setting one leaves another on the default', () => {
    setModelBinding('claude-mock', ANTHROPIC_BINDING);
    expect(getModelBinding('qwen')).toEqual(DEFAULT_BINDING);
  });

  it('clear removes the record so the default shows through; clearing an unbound model is a no-op', () => {
    setModelBinding('claude-mock', ANTHROPIC_BINDING);
    clearModelBinding('claude-mock');
    expect(storage.has('variorum.model.claude-mock')).toBe(false);
    expect(getModelBinding('claude-mock')).toEqual(DEFAULT_BINDING);
    expect(() => clearModelBinding('never-bound')).not.toThrow();
  });

  it('hasStoredBinding tracks the record lifecycle', () => {
    expect(hasStoredBinding('claude-mock')).toBe(false);
    setModelBinding('claude-mock', ANTHROPIC_BINDING);
    expect(hasStoredBinding('claude-mock')).toBe(true);
    clearModelBinding('claude-mock');
    expect(hasStoredBinding('claude-mock')).toBe(false);
  });
});

describe('[G1] parseEndpointUrl', () => {
  it('accepts http(s) URLs, trimmed', () => {
    expect(parseEndpointUrl('http://localhost:1234/v1')).toBe(
      'http://localhost:1234/v1',
    );
    expect(parseEndpointUrl('  https://example.com/v1  ')).toBe(
      'https://example.com/v1',
    );
  });

  it('rejects non-URLs and non-http(s) schemes', () => {
    expect(parseEndpointUrl('not a url')).toBeNull();
    expect(parseEndpointUrl('ftp://example.com/v1')).toBeNull();
    expect(parseEndpointUrl('file:///etc/passwd')).toBeNull();
  });

  it('rejects empty and whitespace-only input', () => {
    expect(parseEndpointUrl('')).toBeNull();
    expect(parseEndpointUrl('   ')).toBeNull();
  });
});

describe('[G1] normalizeApiKey', () => {
  it('returns the trimmed key', () => {
    expect(normalizeApiKey('sk-abc')).toBe('sk-abc');
    expect(normalizeApiKey('  sk-abc  ')).toBe('sk-abc');
  });

  it('returns null for empty and whitespace-only input', () => {
    expect(normalizeApiKey('')).toBeNull();
    expect(normalizeApiKey('   ')).toBeNull();
  });
});
