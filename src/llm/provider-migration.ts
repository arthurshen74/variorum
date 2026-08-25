/**
 * The one-shot fold of legacy per-model bindings (`variorum.model.<name>`,
 * the design before the document) into the Models/Providers document
 * (DESIGN.md "Models and Providers", "First run and migration"). Runs
 * only when the document is absent; the legacy keys are removed once the
 * document is written.
 */
import type { ApiProtocol } from './protocols/adapter';
import { isApiProtocol } from './protocols/registry';
import type { Endpoint, ModelRow, ProviderDocument } from './provider-document';

export const LEGACY_BINDING_KEY_PREFIX = 'variorum.model.';

export interface LegacyBinding {
  api: ApiProtocol;
  endpointUrl: string;
  apiKey?: string;
  maxOutputTokens?: number;
}

function legacyKeys(): string[] {
  const keys: string[] = [];
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (key !== null && key.startsWith(LEGACY_BINDING_KEY_PREFIX)) {
      keys.push(key);
    }
  }
  return keys;
}

function parseLegacyBinding(raw: string): LegacyBinding | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;

  const { api, endpointUrl, apiKey, maxOutputTokens } = parsed as Record<
    string,
    unknown
  >;
  if (!isApiProtocol(api)) return null;
  if (typeof endpointUrl !== 'string') return null;
  if (apiKey !== undefined && typeof apiKey !== 'string') return null;
  if (maxOutputTokens !== undefined && typeof maxOutputTokens !== 'number') {
    return null;
  }

  return {
    api,
    endpointUrl,
    ...(apiKey !== undefined ? { apiKey } : {}),
    ...(maxOutputTokens !== undefined ? { maxOutputTokens } : {}),
  };
}

/** Every parseable legacy record by model name; malformed records are skipped. */
export function readLegacyBindings(): Map<string, LegacyBinding> {
  const bindings = new Map<string, LegacyBinding>();
  for (const key of legacyKeys()) {
    const raw = localStorage.getItem(key);
    if (raw === null) continue;
    const binding = parseLegacyBinding(raw);
    if (binding !== null) {
      bindings.set(key.slice(LEGACY_BINDING_KEY_PREFIX.length), binding);
    }
  }
  return bindings;
}

interface Group {
  url: string;
  api: ApiProtocol;
  records: { modelName: string; binding: LegacyBinding }[];
}

function groupByEndpoint(
  bindings: Map<string, LegacyBinding>,
): Map<string, Group> {
  const groups = new Map<string, Group>();
  for (const [modelName, binding] of bindings) {
    const key = `${binding.endpointUrl} ${binding.api}`;
    const group = groups.get(key) ?? {
      url: binding.endpointUrl,
      api: binding.api,
      records: [],
    };
    group.records.push({ modelName, binding });
    groups.set(key, group);
  }
  return groups;
}

/**
 * The group's key placement: a key shared by every keyed record belongs to
 * the endpoint, differing keys stay on their models.
 */
function sharedKey(group: Group): string | undefined {
  const keys = group.records
    .map((record) => record.binding.apiKey)
    .filter((key): key is string => key !== undefined);
  if (keys.length === 0) return undefined;
  return keys.every((key) => key === keys[0]) ? keys[0] : undefined;
}

function modelRows(group: Group, endpointKey: string | undefined): ModelRow[] {
  return group.records.map(({ modelName, binding }) => {
    const apiKey = binding.apiKey === endpointKey ? undefined : binding.apiKey;
    return {
      modelName,
      handle: modelName,
      ...(apiKey !== undefined ? { apiKey } : {}),
      ...(binding.maxOutputTokens !== undefined
        ? { maxOutputTokens: binding.maxOutputTokens }
        : {}),
    };
  });
}

/** Pure: the seed with the legacy records folded in as endpoints and models. */
export function foldLegacyBindings(
  bindings: Map<string, LegacyBinding>,
  seed: ProviderDocument,
  newId: () => string,
): ProviderDocument {
  const endpoints: Endpoint[] = seed.endpoints.map((endpoint) => ({
    ...endpoint,
    models: [...endpoint.models],
  }));

  for (const group of groupByEndpoint(bindings).values()) {
    const endpointKey = sharedKey(group);
    const authRequired = group.records.some(
      (record) => record.binding.apiKey !== undefined,
    );
    const models = modelRows(group, endpointKey);
    const existing = endpoints.find(
      (endpoint) => endpoint.url === group.url && endpoint.api === group.api,
    );

    if (existing !== undefined) {
      existing.authRequired = existing.authRequired || authRequired;
      if (endpointKey !== undefined) existing.apiKey = endpointKey;
      existing.models.push(...models);
      continue;
    }

    endpoints.push({
      id: newId(),
      url: group.url,
      api: group.api,
      authRequired,
      ...(endpointKey !== undefined ? { apiKey: endpointKey } : {}),
      models,
    });
  }

  return { endpoints };
}

export function removeLegacyBindings(): void {
  for (const key of legacyKeys()) {
    localStorage.removeItem(key);
  }
}
