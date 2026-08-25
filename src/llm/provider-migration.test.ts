/**
 * [G2] The legacy fold (DESIGN.md "Models and Providers", "First run and
 * migration"): scanning variorum.model.* records, grouping them into
 * endpoints, placing keys, folding into the seed, and removing the
 * legacy keys afterwards.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { installLocalStorageStub } from './local-storage-stub';
import {
  DEFAULT_ENDPOINT_URL,
  type ProviderDocument,
} from './provider-document';
import {
  LEGACY_BINDING_KEY_PREFIX,
  foldLegacyBindings,
  readLegacyBindings,
  removeLegacyBindings,
  type LegacyBinding,
} from './provider-migration';

const storage = installLocalStorageStub();

const SEED: ProviderDocument = {
  endpoints: [
    {
      id: 'seed',
      url: DEFAULT_ENDPOINT_URL,
      api: 'openai-compatible',
      authRequired: false,
      models: [],
    },
  ],
};

function ids(): () => string {
  let n = 0;
  return () => `id-${++n}`;
}

function bindings(
  entries: Record<string, LegacyBinding>,
): Map<string, LegacyBinding> {
  return new Map(Object.entries(entries));
}

describe('[G2] readLegacyBindings', () => {
  beforeEach(() => {
    storage.clear();
  });

  it('scans variorum.model.* keys; skips malformed records; ignores other keys', () => {
    storage.set(
      `${LEGACY_BINDING_KEY_PREFIX}claude-mock`,
      JSON.stringify({
        api: 'anthropic-messages',
        endpointUrl: 'http://127.0.0.1:8899/v1',
        apiKey: 'sk-ant-test',
        maxOutputTokens: 1234,
      }),
    );
    storage.set(
      `${LEGACY_BINDING_KEY_PREFIX}qwen`,
      JSON.stringify({
        api: 'openai-compatible',
        endpointUrl: 'http://host:1/v1',
      }),
    );
    storage.set(`${LEGACY_BINDING_KEY_PREFIX}broken`, '{not json');
    storage.set(
      `${LEGACY_BINDING_KEY_PREFIX}vendor`,
      JSON.stringify({ api: 'lm-studio', endpointUrl: 'http://host:1/v1' }),
    );
    storage.set('variorum.baseUrl', 'http://legacy:9/v1');
    storage.set('variorum.apiKey', 'legacy-key');
    storage.set('variorum.tokenRatio.qwen', '1.2');
    storage.set('variorum.theme', 'dark');

    expect(readLegacyBindings()).toEqual(
      bindings({
        'claude-mock': {
          api: 'anthropic-messages',
          endpointUrl: 'http://127.0.0.1:8899/v1',
          apiKey: 'sk-ant-test',
          maxOutputTokens: 1234,
        },
        qwen: { api: 'openai-compatible', endpointUrl: 'http://host:1/v1' },
      }),
    );
  });
});

describe('[G2] foldLegacyBindings', () => {
  it('groups records by (endpointUrl, api) into one endpoint each; every record becomes a model with handle = modelName and its cap', () => {
    const folded = foldLegacyBindings(
      bindings({
        a: { api: 'openai-compatible', endpointUrl: 'http://host:1/v1' },
        b: {
          api: 'openai-compatible',
          endpointUrl: 'http://host:1/v1',
          maxOutputTokens: 99,
        },
        c: {
          api: 'anthropic-messages',
          endpointUrl: 'http://host:1/v1',
          maxOutputTokens: 1234,
        },
        d: { api: 'openai-compatible', endpointUrl: 'http://host:2/v1' },
      }),
      SEED,
      ids(),
    );

    const byPair = (url: string, api: string) =>
      folded.endpoints.find((e) => e.url === url && e.api === api);
    expect(folded.endpoints).toHaveLength(4);
    expect(byPair('http://host:1/v1', 'openai-compatible')).toMatchObject({
      authRequired: false,
      models: [
        { modelName: 'a', handle: 'a' },
        { modelName: 'b', handle: 'b', maxOutputTokens: 99 },
      ],
    });
    expect(byPair('http://host:1/v1', 'anthropic-messages')).toMatchObject({
      authRequired: false,
      models: [{ modelName: 'c', handle: 'c', maxOutputTokens: 1234 }],
    });
    expect(byPair('http://host:2/v1', 'openai-compatible')?.models).toEqual([
      { modelName: 'd', handle: 'd' },
    ]);
    expect(byPair(DEFAULT_ENDPOINT_URL, 'openai-compatible')).toEqual(
      SEED.endpoints[0],
    );
  });

  it('authRequired is true when any record in the group carried a key, false otherwise', () => {
    const folded = foldLegacyBindings(
      bindings({
        keyed: {
          api: 'openai-compatible',
          endpointUrl: 'http://host:1/v1',
          apiKey: 'k',
        },
        bare: { api: 'openai-compatible', endpointUrl: 'http://host:1/v1' },
        other: { api: 'openai-compatible', endpointUrl: 'http://host:2/v1' },
      }),
      SEED,
      ids(),
    );
    expect(
      folded.endpoints.find((e) => e.url === 'http://host:1/v1')?.authRequired,
    ).toBe(true);
    expect(
      folded.endpoints.find((e) => e.url === 'http://host:2/v1')?.authRequired,
    ).toBe(false);
  });

  it('a key shared by every keyed record moves to the endpoint and off the models', () => {
    const folded = foldLegacyBindings(
      bindings({
        a: {
          api: 'openai-compatible',
          endpointUrl: 'http://host:1/v1',
          apiKey: 'shared',
        },
        b: {
          api: 'openai-compatible',
          endpointUrl: 'http://host:1/v1',
          apiKey: 'shared',
        },
        bare: { api: 'openai-compatible', endpointUrl: 'http://host:1/v1' },
      }),
      SEED,
      ids(),
    );
    const group = folded.endpoints.find((e) => e.url === 'http://host:1/v1');
    expect(group?.apiKey).toBe('shared');
    expect(group?.authRequired).toBe(true);
    expect(group?.models).toEqual([
      { modelName: 'a', handle: 'a' },
      { modelName: 'b', handle: 'b' },
      { modelName: 'bare', handle: 'bare' },
    ]);
  });

  it('differing keys stay on each model and none lands on the endpoint', () => {
    const folded = foldLegacyBindings(
      bindings({
        a: {
          api: 'openai-compatible',
          endpointUrl: 'http://host:1/v1',
          apiKey: 'key-a',
        },
        b: {
          api: 'openai-compatible',
          endpointUrl: 'http://host:1/v1',
          apiKey: 'key-b',
        },
        bare: { api: 'openai-compatible', endpointUrl: 'http://host:1/v1' },
      }),
      SEED,
      ids(),
    );
    const group = folded.endpoints.find((e) => e.url === 'http://host:1/v1');
    expect(group).not.toHaveProperty('apiKey');
    expect(group?.authRequired).toBe(true);
    expect(group?.models).toEqual([
      { modelName: 'a', handle: 'a', apiKey: 'key-a' },
      { modelName: 'b', handle: 'b', apiKey: 'key-b' },
      { modelName: 'bare', handle: 'bare' },
    ]);
  });

  it('a group equal to the LM Studio default replaces the seed endpoint rather than duplicating it', () => {
    const folded = foldLegacyBindings(
      bindings({
        qwen: { api: 'openai-compatible', endpointUrl: DEFAULT_ENDPOINT_URL },
      }),
      SEED,
      ids(),
    );
    expect(folded.endpoints).toHaveLength(1);
    expect(folded.endpoints[0]).toMatchObject({
      url: DEFAULT_ENDPOINT_URL,
      api: 'openai-compatible',
      authRequired: false,
      models: [{ modelName: 'qwen', handle: 'qwen' }],
    });
  });

  it('with no legacy records the seed is returned unchanged', () => {
    expect(foldLegacyBindings(new Map(), SEED, ids())).toEqual(SEED);
  });

  it('endpoint ids come from the supplied generator', () => {
    const folded = foldLegacyBindings(
      bindings({
        a: { api: 'openai-compatible', endpointUrl: 'http://host:1/v1' },
        b: { api: 'anthropic-messages', endpointUrl: 'http://host:2/v1' },
      }),
      SEED,
      ids(),
    );
    const generated = folded.endpoints
      .filter((e) => e.id !== 'seed')
      .map((e) => e.id);
    expect(generated.sort()).toEqual(['id-1', 'id-2']);
  });
});

describe('[G2] removeLegacyBindings', () => {
  beforeEach(() => {
    storage.clear();
  });

  it('removes only variorum.model.* keys', () => {
    storage.set(`${LEGACY_BINDING_KEY_PREFIX}a`, '{}');
    storage.set(`${LEGACY_BINDING_KEY_PREFIX}b`, '{}');
    storage.set('variorum.llm', '{"endpoints":[]}');
    storage.set('variorum.tokenRatio.a', '1');
    storage.set('variorum.theme', 'dark');
    storage.set('variorum.baseUrl', 'http://legacy:9/v1');

    removeLegacyBindings();

    expect([...storage.keys()].sort()).toEqual([
      'variorum.baseUrl',
      'variorum.llm',
      'variorum.theme',
      'variorum.tokenRatio.a',
    ]);
  });
});
