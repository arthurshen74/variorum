/**
 * The Models/Providers document (DESIGN.md "Models and Providers"):
 * device state in localStorage under `variorum.llm` — a tree of
 * endpoints, each holding the models it serves. Never in the Zustand
 * store, never in an export. This module owns the shape, the boundary
 * validator, and the read/write/seed path; mutations live in
 * provider-mutations.ts, the legacy fold in provider-migration.ts.
 */
import type { ApiProtocol } from './protocols/adapter';

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

/** Boundary guard for stored JSON: rebuilt field by field, or throws ProviderDocumentError. */
export function parseProviderDocument(raw: string): ProviderDocument {
  void raw;
  throw new Error('not implemented: parseProviderDocument');
}

/** The first-run document: one LM Studio endpoint, no models. */
export function seedDocument(id: string): ProviderDocument {
  void id;
  throw new Error('not implemented: seedDocument');
}

/**
 * The stored document. Absent: seed it, fold any legacy records in, write
 * it, remove the legacy keys. Malformed: throws ProviderDocumentError and
 * leaves the stored value untouched.
 */
export function readProviderDocument(): ProviderDocument {
  throw new Error('not implemented: readProviderDocument');
}

export function writeProviderDocument(document: ProviderDocument): void {
  void document;
  throw new Error('not implemented: writeProviderDocument');
}

/** Boundary validation: trimmed, parseable, http(s)-schemed URL — or null. */
export function parseEndpointUrl(input: string): string | null {
  void input;
  throw new Error('not implemented: parseEndpointUrl');
}

/** Boundary normalization: the trimmed key, or null when empty/whitespace-only. */
export function normalizeApiKey(input: string): string | null {
  void input;
  throw new Error('not implemented: normalizeApiKey');
}
