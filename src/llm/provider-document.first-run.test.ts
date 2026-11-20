/**
 * [G2] The Models/Providers document on first run (DESIGN.md "Models and
 * Providers", "First run and migration"): an absent document is created
 * EMPTY — no endpoint is seeded — while the one-shot legacy fold still
 * runs and still adds nothing of its own.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { installLocalStorageStub } from './local-storage-stub';
import {
  DEFAULT_ENDPOINT_URL,
  PROVIDER_DOCUMENT_KEY,
  readProviderDocument,
} from './provider-document';

const storage = installLocalStorageStub();

describe('[G2] readProviderDocument on first run', () => {
  beforeEach(() => {
    storage.clear();
  });

  it('with no stored document writes an empty document and returns it', () => {
    const document = readProviderDocument();
    expect(document).toEqual({ endpoints: [] });
    const raw = storage.get(PROVIDER_DOCUMENT_KEY);
    expect(raw).toBeDefined();
    expect(JSON.parse(raw ?? '')).toEqual({ endpoints: [] });
  });

  it('a second read returns the stored empty document', () => {
    readProviderDocument();
    const raw = storage.get(PROVIDER_DOCUMENT_KEY);
    expect(readProviderDocument()).toEqual({ endpoints: [] });
    expect(storage.get(PROVIDER_DOCUMENT_KEY)).toBe(raw);
  });

  it('folds legacy records into endpoints and adds no LM Studio endpoint', () => {
    storage.set(
      'variorum.model.claude-mock',
      JSON.stringify({
        api: 'anthropic-messages',
        endpointUrl: 'http://127.0.0.1:8899/v1',
        apiKey: 'sk-ant-test',
      }),
    );

    const document = readProviderDocument();
    expect(document.endpoints).toHaveLength(1);
    expect(document.endpoints[0]).toMatchObject({
      url: 'http://127.0.0.1:8899/v1',
      api: 'anthropic-messages',
      models: [{ modelName: 'claude-mock', handle: 'claude-mock' }],
    });
    expect(document.endpoints.some((e) => e.url === DEFAULT_ENDPOINT_URL)).toBe(
      false,
    );
    expect(storage.has('variorum.model.claude-mock')).toBe(false);
  });

  it('still ignores variorum.baseUrl and variorum.apiKey: endpoints stay empty', () => {
    storage.set('variorum.baseUrl', 'http://legacy:9/v1');
    storage.set('variorum.apiKey', 'legacy-key');
    expect(readProviderDocument()).toEqual({ endpoints: [] });
    expect(storage.get('variorum.baseUrl')).toBe('http://legacy:9/v1');
    expect(storage.get('variorum.apiKey')).toBe('legacy-key');
  });
});
