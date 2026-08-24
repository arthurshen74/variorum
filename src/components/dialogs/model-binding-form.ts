/**
 * Pure helpers for the Models view (DESIGN.md "Management UI", "Model
 * Bindings"): which model names the view lists, and the boundary between
 * raw field text and a saveable ModelBinding. No IO — the dialog owns
 * localStorage access through the model-binding module.
 */
import type { Configuration, ConfigurationVersion } from '@/domain/types';
import type { ApiProtocol, ModelBinding } from '@/llm/model-binding';

export interface ModelBindingDraft {
  api: ApiProtocol;
  endpointUrl: string;
  /** Raw field text; empty means no key. */
  apiKey: string;
  /** Raw field text; blank means use the default. */
  maxOutputTokens: string;
}

/**
 * Distinct model names across the LATEST saved version of every
 * configuration, archived included, sorted — the set of models
 * generation can currently target.
 */
export function boundModelNames(
  configurations: Configuration[],
  versions: ConfigurationVersion[],
): string[] {
  void configurations;
  void versions;
  throw new Error('not implemented: boundModelNames');
}

/** Prefill: a stored (or default) binding as field text. */
export function draftFromBinding(binding: ModelBinding): ModelBindingDraft {
  void binding;
  throw new Error('not implemented: draftFromBinding');
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
  void draft;
  throw new Error('not implemented: parseBindingDraft');
}
