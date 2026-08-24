/**
 * Pure helpers for the Models view (DESIGN.md "Management UI", "Model
 * Bindings"): which model names the view lists, and the boundary between
 * raw field text and a saveable ModelBinding. No IO — the dialog owns
 * localStorage access through the model-binding module.
 */
import type { Configuration, ConfigurationVersion } from '@/domain/types';
import {
  normalizeApiKey,
  parseEndpointUrl,
  type ApiProtocol,
  type ModelBinding,
} from '@/llm/model-binding';

export interface ModelBindingDraft {
  api: ApiProtocol;
  endpointUrl: string;
  /** Raw field text; empty means no key. */
  apiKey: string;
  /** Raw field text; blank means use the default. */
  maxOutputTokens: string;
}

const MESSAGES_API: ApiProtocol = 'anthropic-messages';

/**
 * Distinct model names across the LATEST saved version of every
 * configuration, archived included, sorted — the set of models
 * generation can currently target.
 */
export function boundModelNames(
  configurations: Configuration[],
  versions: ConfigurationVersion[],
): string[] {
  const latest = new Map<string, ConfigurationVersion>();
  for (const version of versions) {
    const best = latest.get(version.name);
    if (best === undefined || version.version > best.version) {
      latest.set(version.name, version);
    }
  }

  const names = new Set<string>();
  for (const configuration of configurations) {
    const version = latest.get(configuration.name);
    if (version !== undefined) names.add(version.modelName);
  }
  return [...names].sort();
}

/** Prefill: a stored (or default) binding as field text. */
export function draftFromBinding(binding: ModelBinding): ModelBindingDraft {
  return {
    api: binding.api,
    endpointUrl: binding.endpointUrl,
    apiKey: binding.apiKey ?? '',
    maxOutputTokens:
      binding.maxOutputTokens === undefined
        ? ''
        : String(binding.maxOutputTokens),
  };
}

/**
 * Form boundary: a saveable ModelBinding, or null when the endpoint URL
 * is unparseable or maxOutputTokens is non-numeric. An empty key means
 * no apiKey; a blank maxOutputTokens is omitted; openai-compatible
 * drafts never carry maxOutputTokens.
 */
export function parseBindingDraft(
  draft: ModelBindingDraft,
): ModelBinding | null {
  const endpointUrl = parseEndpointUrl(draft.endpointUrl);
  if (endpointUrl === null) return null;

  const apiKey = normalizeApiKey(draft.apiKey);

  // The cap rides on the Messages wire only, so it is parsed only there:
  // field text stranded by an API switch must not block a save.
  let maxOutputTokens: number | undefined;
  if (draft.api === MESSAGES_API) {
    const cap = draft.maxOutputTokens.trim();
    if (cap !== '') {
      const parsed = Number(cap);
      if (!Number.isFinite(parsed)) return null;
      maxOutputTokens = parsed;
    }
  }

  return {
    api: draft.api,
    endpointUrl,
    ...(apiKey !== null ? { apiKey } : {}),
    ...(maxOutputTokens !== undefined ? { maxOutputTokens } : {}),
  };
}
