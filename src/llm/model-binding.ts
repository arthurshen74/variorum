/**
 * Model bindings (DESIGN.md "Model Bindings"): per-model device state in
 * localStorage under `variorum.model.<modelName>` — which endpoint a
 * model lives at, which wire protocol it speaks, the API key for it, and
 * (Anthropic Messages only) the mandatory output cap. Device state,
 * outside everything-in-IndexedDB: never in the Zustand store, never in
 * an export. When no binding is stored, the LM Studio default applies.
 * The legacy global keys (`variorum.baseUrl`, `variorum.apiKey`) are
 * dead: ignored if present, never migrated, never written.
 */

export type ApiProtocol = 'openai-compatible' | 'anthropic-messages';

export interface ModelBinding {
  api: ApiProtocol;
  endpointUrl: string;
  apiKey?: string;
  /** anthropic-messages only; absent means DEFAULT_MAX_OUTPUT_TOKENS. */
  maxOutputTokens?: number;
}

// Exported so the Models view can show what Reset returns to.
export const DEFAULT_BASE_URL = 'http://localhost:1234/v1'; // LM Studio default

export const DEFAULT_BINDING: ModelBinding = {
  api: 'openai-compatible',
  endpointUrl: DEFAULT_BASE_URL,
};

export const DEFAULT_MAX_OUTPUT_TOKENS = 32000;

const MODEL_BINDING_KEY_PREFIX = 'variorum.model.';

const API_PROTOCOLS: ApiProtocol[] = [
  'openai-compatible',
  'anthropic-messages',
];

function bindingKey(modelName: string): string {
  return `${MODEL_BINDING_KEY_PREFIX}${modelName}`;
}

/** Boundary guard for stored JSON: a valid ModelBinding, or null. */
export function parseModelBinding(raw: string): ModelBinding | null {
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

  if (!API_PROTOCOLS.includes(api as ApiProtocol)) return null;
  if (typeof endpointUrl !== 'string') return null;
  if (apiKey !== undefined && typeof apiKey !== 'string') return null;
  if (maxOutputTokens !== undefined && typeof maxOutputTokens !== 'number') {
    return null;
  }

  // Rebuilt field by field, not echoed: unknown extras never enter the shape.
  return {
    api: api as ApiProtocol,
    endpointUrl,
    ...(apiKey !== undefined ? { apiKey } : {}),
    ...(maxOutputTokens !== undefined ? { maxOutputTokens } : {}),
  };
}

/** The stored binding, or DEFAULT_BINDING when absent or malformed. */
export function getModelBinding(modelName: string): ModelBinding {
  const raw = localStorage.getItem(bindingKey(modelName));
  if (raw === null) return DEFAULT_BINDING;
  return parseModelBinding(raw) ?? DEFAULT_BINDING;
}

/** Whether a stored record exists (the Models view's stored-vs-default display). */
export function hasStoredBinding(modelName: string): boolean {
  return localStorage.getItem(bindingKey(modelName)) !== null;
}

export function setModelBinding(
  modelName: string,
  binding: ModelBinding,
): void {
  localStorage.setItem(bindingKey(modelName), JSON.stringify(binding));
}

/** Reset: remove the record so the default shows through. */
export function clearModelBinding(modelName: string): void {
  localStorage.removeItem(bindingKey(modelName));
}

const ALLOWED_PROTOCOLS = ['http:', 'https:'];

/** Boundary validation: trimmed, parseable, http(s)-schemed URL — or null. */
export function parseEndpointUrl(input: string): string | null {
  const trimmed = input.trim();
  if (trimmed === '') return null;

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }
  if (!ALLOWED_PROTOCOLS.includes(parsed.protocol)) return null;

  // The trimmed input, not parsed.href: normalization would append a
  // trailing slash and the endpoint field would change under the user.
  return trimmed;
}

/** Boundary normalization: the trimmed key, or null when empty/whitespace-only. */
export function normalizeApiKey(input: string): string | null {
  const trimmed = input.trim();
  return trimmed === '' ? null : trimmed;
}
