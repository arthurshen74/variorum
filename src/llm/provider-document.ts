/**
 * The Models/Providers document (DESIGN.md "Models and Providers"):
 * device state in localStorage under `variorum.llm` — a tree of
 * endpoints, each holding the models it serves. Never in the Zustand
 * store, never in an export. This module owns the shape, the boundary
 * validator, and the read/write/seed path; mutations live in
 * provider-mutations.ts, the legacy fold in provider-migration.ts.
 */
import type { ApiProtocol } from './protocols/adapter';
import { DEFAULT_ENDPOINT_PROTOCOL, isApiProtocol } from './protocols/registry';
import {
  foldLegacyBindings,
  readLegacyBindings,
  removeLegacyBindings,
} from './provider-migration';

export const PROVIDER_DOCUMENT_KEY = 'variorum.llm';

// LM Studio's default; the seed endpoint on first run.
export const DEFAULT_ENDPOINT_URL = 'http://localhost:1234/v1';

export interface ModelRow {
  /** The id that goes on the wire; unique within its endpoint. */
  modelName: string;
  /** What configurations name; unique across the document. */
  handle: string;
  apiKey?: string;
  /** Only meaningful under an adapter that usesMaxOutputTokens. */
  maxOutputTokens?: number;
}

export interface Endpoint {
  /** Generated at creation, never shown. */
  id: string;
  url: string;
  api: ApiProtocol;
  authRequired: boolean;
  apiKey?: string;
  models: ModelRow[];
}

export interface ProviderDocument {
  endpoints: Endpoint[];
}

/** A stored document that fails validation; the message names the key. */
export class ProviderDocumentError extends Error {
  constructor(reason: string) {
    super(`${PROVIDER_DOCUMENT_KEY}: ${reason}`);
    this.name = 'ProviderDocumentError';
  }
}

type Fields = Record<string, unknown>;

function requireObject(value: unknown, what: string): Fields {
  if (typeof value !== 'object' || value === null) {
    throw new ProviderDocumentError(`${what} must be an object`);
  }
  return value as Fields;
}

function requireText(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new ProviderDocumentError(`${field} must be a non-empty string`);
  }
  return value;
}

function optionalText(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') {
    throw new ProviderDocumentError(`${field} must be a string`);
  }
  return value;
}

function optionalNumber(value: unknown, field: string): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'number') {
    throw new ProviderDocumentError(`${field} must be a number`);
  }
  return value;
}

function parseModelRow(value: unknown): ModelRow {
  const fields = requireObject(value, 'model');
  const modelName = requireText(fields.modelName, 'model modelName');
  const handle = requireText(fields.handle, 'model handle');
  const apiKey = optionalText(fields.apiKey, 'model apiKey');
  const maxOutputTokens = optionalNumber(
    fields.maxOutputTokens,
    'model maxOutputTokens',
  );
  return {
    modelName,
    handle,
    ...(apiKey !== undefined ? { apiKey } : {}),
    ...(maxOutputTokens !== undefined ? { maxOutputTokens } : {}),
  };
}

function parseEndpoint(value: unknown): Endpoint {
  const fields = requireObject(value, 'endpoint');
  const id = requireText(fields.id, 'endpoint id');

  if (typeof fields.url !== 'string') {
    throw new ProviderDocumentError('endpoint url must be a string');
  }
  const url = parseEndpointUrl(fields.url);
  if (url === null) {
    throw new ProviderDocumentError(
      `endpoint url is not an http(s) URL: ${fields.url}`,
    );
  }

  if (!isApiProtocol(fields.api)) {
    throw new ProviderDocumentError(
      `endpoint api is not a known protocol: ${String(fields.api)}`,
    );
  }
  if (typeof fields.authRequired !== 'boolean') {
    throw new ProviderDocumentError('endpoint authRequired must be a boolean');
  }
  const apiKey = optionalText(fields.apiKey, 'endpoint apiKey');
  if (!Array.isArray(fields.models)) {
    throw new ProviderDocumentError('endpoint models must be an array');
  }

  const models = fields.models.map(parseModelRow);
  const seenModelNames = new Set<string>();
  for (const model of models) {
    if (seenModelNames.has(model.modelName)) {
      throw new ProviderDocumentError(
        `duplicate modelName within an endpoint: ${model.modelName}`,
      );
    }
    seenModelNames.add(model.modelName);
  }

  return {
    id,
    url,
    api: fields.api,
    authRequired: fields.authRequired,
    ...(apiKey !== undefined ? { apiKey } : {}),
    models,
  };
}

/** Boundary guard for stored JSON: rebuilt field by field, or throws ProviderDocumentError. */
export function parseProviderDocument(raw: string): ProviderDocument {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ProviderDocumentError('not valid JSON');
  }

  const root = requireObject(parsed, 'document');
  if (!Array.isArray(root.endpoints)) {
    throw new ProviderDocumentError('endpoints must be an array');
  }

  const endpoints = root.endpoints.map(parseEndpoint);

  const seenPairs = new Set<string>();
  const seenHandles = new Set<string>();
  for (const endpoint of endpoints) {
    const pair = `${endpoint.url} ${endpoint.api}`;
    if (seenPairs.has(pair)) {
      throw new ProviderDocumentError(
        `duplicate endpoint url and api: ${endpoint.url} (${endpoint.api})`,
      );
    }
    seenPairs.add(pair);
    for (const model of endpoint.models) {
      if (seenHandles.has(model.handle)) {
        throw new ProviderDocumentError(`duplicate handle: ${model.handle}`);
      }
      seenHandles.add(model.handle);
    }
  }

  return { endpoints };
}

/** The first-run document: one LM Studio endpoint, no models. */
export function seedDocument(id: string): ProviderDocument {
  return {
    endpoints: [
      {
        id,
        url: DEFAULT_ENDPOINT_URL,
        api: DEFAULT_ENDPOINT_PROTOCOL,
        authRequired: false,
        models: [],
      },
    ],
  };
}

/**
 * The stored document. Absent: seed it, fold any legacy records in, write
 * it, remove the legacy keys. Malformed: throws ProviderDocumentError and
 * leaves the stored value untouched.
 */
export function readProviderDocument(): ProviderDocument {
  const raw = localStorage.getItem(PROVIDER_DOCUMENT_KEY);
  if (raw !== null) return parseProviderDocument(raw);

  const document = foldLegacyBindings(
    readLegacyBindings(),
    seedDocument(crypto.randomUUID()),
    () => crypto.randomUUID(),
  );
  writeProviderDocument(document);
  removeLegacyBindings();
  return document;
}

export function writeProviderDocument(document: ProviderDocument): void {
  localStorage.setItem(PROVIDER_DOCUMENT_KEY, JSON.stringify(document));
}

const ALLOWED_URL_PROTOCOLS = ['http:', 'https:'];

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
  if (!ALLOWED_URL_PROTOCOLS.includes(parsed.protocol)) return null;

  // The trimmed input, not parsed.href: normalization would append a
  // trailing slash and the endpoint field would change under the user.
  return trimmed;
}

/** Boundary normalization: the trimmed key, or null when empty/whitespace-only. */
export function normalizeApiKey(input: string): string | null {
  const trimmed = input.trim();
  return trimmed === '' ? null : trimmed;
}
