/**
 * The LLM transport (DESIGN.md "LLM Provider Interface"): an
 * OpenAI-compatible endpoint, LM Studio first, spoken to directly from the
 * browser. API key and base URL live in localStorage, beside the theme
 * preference — device state, outside everything-in-IndexedDB (DESIGN.md
 * "API Keys"; XSS caveats apply).
 */
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';

const BASE_URL_KEY = 'variorum.baseUrl';
const API_KEY_KEY = 'variorum.apiKey';

// Exported so the Endpoint view can show what Reset returns to.
export const DEFAULT_BASE_URL = 'http://localhost:1234/v1'; // LM Studio default

export function getBaseUrl(): string {
  return localStorage.getItem(BASE_URL_KEY) ?? DEFAULT_BASE_URL;
}

export function setBaseUrl(url: string): void {
  localStorage.setItem(BASE_URL_KEY, url);
}

const ALLOWED_PROTOCOLS = ['http:', 'https:'];

/** Boundary validation: trimmed, parseable, http(s)-schemed URL — or null. */
export function parseBaseUrl(input: string): string | null {
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
  // trailing slash and the Endpoint field would change under the user.
  return trimmed;
}

/** Reset: remove the stored value so the default shows through. */
export function clearBaseUrl(): void {
  localStorage.removeItem(BASE_URL_KEY);
}

export function getApiKey(): string | null {
  return localStorage.getItem(API_KEY_KEY);
}

export function setApiKey(key: string): void {
  localStorage.setItem(API_KEY_KEY, key);
}

/** Boundary normalization: the trimmed key, or null when empty/whitespace-only. */
export function normalizeApiKey(input: string): string | null {
  const trimmed = input.trim();
  return trimmed === '' ? null : trimmed;
}

/** Unset: remove the stored key so requests carry no Authorization header. */
export function clearApiKey(): void {
  localStorage.removeItem(API_KEY_KEY);
}

/**
 * Provider factory. The model id, system prompt, and sampling parameters
 * come from the active configuration version at call time — never from
 * here (CLAUDE.md: never hardcode them).
 */
export function createProvider(fetchImpl?: typeof fetch) {
  // No key stored means no apiKey option, and so no Authorization header —
  // an endpoint that wants one should answer with its own auth error.
  const apiKey = getApiKey();
  return createOpenAICompatible({
    name: 'variorum-local',
    baseURL: getBaseUrl(),
    // Puts stream_options.include_usage on every request: without it no
    // OpenAI-compatible surface reports token usage for a stream at all.
    includeUsage: true,
    ...(apiKey !== null ? { apiKey } : {}),
    ...(fetchImpl !== undefined ? { fetch: fetchImpl } : {}),
  });
}
