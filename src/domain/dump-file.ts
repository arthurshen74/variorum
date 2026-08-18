/**
 * Dump text — the serialize/parse half of DESIGN.md "The Dump Is a File".
 * Pure: text in, text out, no IO.
 *
 * `parseDump` is the STRUCTURAL boundary gate. It narrows untrusted JSON to a
 * DatabaseDump, rebuilding every record from its declared fields so unknown
 * keys never reach IndexedDB. It deliberately does NOT judge meaning — schema
 * version and referential integrity stay in assertValidDump, which runs after
 * and trusts the shape this module establishes.
 *
 * Filenames take their clock as an argument so they stay pure; file-io.ts
 * supplies the real one.
 */
import type {
  Artifact,
  ArtifactSource,
  Configuration,
  ConfigurationVersion,
  DatabaseDump,
  Message,
  MessageKind,
  MessageRole,
  Unit,
} from './types';

const INDENT = 2;

const EXPORT_PREFIX = 'variorum';
const BACKUP_PREFIX = 'variorum-pre-replace';
const FILE_EXTENSION = '.json';

/** Root of the paths a refusal names: dump.units[3].artifacts[0].savedAt. */
const ROOT_PATH = 'dump';

const MESSAGE_ROLES: readonly MessageRole[] = ['user', 'assistant'];
const ARTIFACT_SOURCES: readonly ArtifactSource[] = ['llm', 'manual'];
const MESSAGE_KINDS: readonly MessageKind[] = ['editNotice'];

type Json = Record<string, unknown>;

/** Pretty-printed so a backup is diffable and readable. */
export function serializeDump(dump: DatabaseDump): string {
  return JSON.stringify(dump, null, INDENT);
}

/** Throws on anything that is not structurally a dump. */
export function parseDump(text: string): DatabaseDump {
  let root: unknown;
  try {
    root = JSON.parse(text);
  } catch {
    throw new Error(`${ROOT_PATH} is not valid JSON`);
  }
  const record = objectAt(root, ROOT_PATH);
  return {
    schemaVersion: requiredNumber(record, 'schemaVersion', ROOT_PATH),
    configurations: eachRecord(
      record,
      'configurations',
      ROOT_PATH,
      parseConfiguration,
    ),
    configurationVersions: eachRecord(
      record,
      'configurationVersions',
      ROOT_PATH,
      parseConfigurationVersion,
    ),
    units: eachRecord(record, 'units', ROOT_PATH, parseUnit),
  };
}

export function exportFilename(now: Date): string {
  return `${EXPORT_PREFIX}-${stamp(now)}${FILE_EXTENSION}`;
}

export function backupFilename(now: Date): string {
  return `${BACKUP_PREFIX}-${stamp(now)}${FILE_EXTENSION}`;
}

/** Local time — the filename dates the user's day, not UTC's. */
function stamp(now: Date): string {
  const date = [now.getFullYear(), now.getMonth() + 1, now.getDate()]
    .map(pad)
    .join('-');
  return `${date}-${pad(now.getHours())}${pad(now.getMinutes())}`;
}

function pad(part: number): string {
  return String(part).padStart(2, '0');
}

// ---------------------------------------------------------------------------
// Record parsers. Each rebuilds its record from the declared fields, which is
// what strips unknown keys.
// ---------------------------------------------------------------------------

function parseConfiguration(value: unknown, path: string): Configuration {
  const record = objectAt(value, path);
  const description = optionalString(record, 'description', path);
  return {
    name: requiredString(record, 'name', path),
    artifactType: requiredString(record, 'artifactType', path),
    archived: requiredBoolean(record, 'archived', path),
    ...(description !== undefined && { description }),
  };
}

function parseConfigurationVersion(
  value: unknown,
  path: string,
): ConfigurationVersion {
  const record = objectAt(value, path);
  const temperature = optionalNumber(record, 'temperature', path);
  const topP = optionalNumber(record, 'topP', path);
  const topK = optionalNumber(record, 'topK', path);
  const reasoningEffort = optionalString(record, 'reasoningEffort', path);
  return {
    name: requiredString(record, 'name', path),
    version: requiredInteger(record, 'version', path),
    modelName: requiredString(record, 'modelName', path),
    systemPrompt: requiredString(record, 'systemPrompt', path),
    ...(temperature !== undefined && { temperature }),
    ...(topP !== undefined && { topP }),
    ...(topK !== undefined && { topK }),
    ...(reasoningEffort !== undefined && { reasoningEffort }),
  };
}

function parseUnit(value: unknown, path: string): Unit {
  const record = objectAt(value, path);
  return {
    id: requiredString(record, 'id', path),
    conversationName: requiredString(record, 'conversationName', path),
    configName: requiredString(record, 'configName', path),
    createdAt: requiredString(record, 'createdAt', path),
    archived: requiredBoolean(record, 'archived', path),
    messages: eachRecord(record, 'messages', path, parseMessage),
    artifacts: eachRecord(record, 'artifacts', path, parseArtifact),
  };
}

function parseMessage(value: unknown, path: string): Message {
  const record = objectAt(value, path);
  const receivedFinishedAt = optionalString(record, 'receivedFinishedAt', path);
  const reasoning = optionalString(record, 'reasoning', path);
  const kind = optionalEnum(record, 'kind', MESSAGE_KINDS, path);
  const artifactVersion = optionalInteger(record, 'artifactVersion', path);
  // The pair is the notice: a kind with nothing to point at, or a pointer
  // with no kind, is a message no writer of ours could have produced.
  if ((kind === undefined) !== (artifactVersion === undefined)) {
    fail(`${path}.artifactVersion`, 'and kind must be set together');
  }
  return {
    role: requiredEnum(record, 'role', MESSAGE_ROLES, path),
    configVersion: requiredInteger(record, 'configVersion', path),
    sentAt: requiredString(record, 'sentAt', path),
    content: requiredString(record, 'content', path),
    ...(receivedFinishedAt !== undefined && { receivedFinishedAt }),
    ...(reasoning !== undefined && { reasoning }),
    ...(kind !== undefined && { kind }),
    ...(artifactVersion !== undefined && { artifactVersion }),
  };
}

function parseArtifact(value: unknown, path: string): Artifact {
  const record = objectAt(value, path);
  const messageIndex = optionalNumber(record, 'messageIndex', path);
  return {
    version: requiredInteger(record, 'version', path),
    savedAt: requiredString(record, 'savedAt', path),
    source: requiredEnum(record, 'source', ARTIFACT_SOURCES, path),
    content: requiredString(record, 'content', path),
    ...(messageIndex !== undefined && { messageIndex }),
  };
}

// ---------------------------------------------------------------------------
// Field readers. An absent field and a wrong-typed one draw the same
// complaint: the path is what locates the fault.
// ---------------------------------------------------------------------------

function fail(path: string, complaint: string): never {
  throw new Error(`${path} ${complaint}`);
}

function objectAt(value: unknown, path: string): Json {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    fail(path, 'must be an object');
  }
  return value as Json;
}

/** Reads an array field and parses each element under an indexed path. */
function eachRecord<T>(
  record: Json,
  key: string,
  path: string,
  parse: (value: unknown, path: string) => T,
): T[] {
  const field = `${path}.${key}`;
  const items = record[key];
  if (!Array.isArray(items)) {
    fail(field, 'must be an array');
  }
  return items.map((item, index) => parse(item, `${field}[${index}]`));
}

function requiredString(record: Json, key: string, path: string): string {
  const value = record[key];
  if (typeof value !== 'string') {
    fail(`${path}.${key}`, 'must be a string');
  }
  return value;
}

function optionalString(
  record: Json,
  key: string,
  path: string,
): string | undefined {
  return record[key] === undefined
    ? undefined
    : requiredString(record, key, path);
}

function requiredNumber(record: Json, key: string, path: string): number {
  const value = record[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    fail(`${path}.${key}`, 'must be a number');
  }
  return value;
}

function optionalNumber(
  record: Json,
  key: string,
  path: string,
): number | undefined {
  return record[key] === undefined
    ? undefined
    : requiredNumber(record, key, path);
}

function requiredInteger(record: Json, key: string, path: string): number {
  const value = requiredNumber(record, key, path);
  if (!Number.isInteger(value)) {
    fail(`${path}.${key}`, 'must be a whole number');
  }
  return value;
}

function optionalInteger(
  record: Json,
  key: string,
  path: string,
): number | undefined {
  return record[key] === undefined
    ? undefined
    : requiredInteger(record, key, path);
}

function requiredBoolean(record: Json, key: string, path: string): boolean {
  const value = record[key];
  if (typeof value !== 'boolean') {
    fail(`${path}.${key}`, 'must be a boolean');
  }
  return value;
}

function requiredEnum<T extends string>(
  record: Json,
  key: string,
  allowed: readonly T[],
  path: string,
): T {
  const value = record[key];
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    fail(`${path}.${key}`, `must be one of: ${allowed.join(', ')}`);
  }
  return value as T;
}

function optionalEnum<T extends string>(
  record: Json,
  key: string,
  allowed: readonly T[],
  path: string,
): T | undefined {
  return record[key] === undefined
    ? undefined
    : requiredEnum(record, key, allowed, path);
}
