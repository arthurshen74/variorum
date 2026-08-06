/**
 * The LinkML projection (DESIGN.md "LinkML Graph Viewer"): normalizes a
 * LinkML YAML string — inline attributes, top-level slot references,
 * slot_usage merges — into one effective-slots graph model. Pure: no
 * React, no IO. Boundary handling only, never LinkML validation.
 */
import { parse } from 'yaml';

export type Cardinality = '1' | '0..1' | '1..*' | '0..*';

export interface EffectiveSlot {
  name: string;
  /** Scalar/type or enum name — row slots only; class ranges become relationships. */
  range: string;
  cardinality: Cardinality;
}

export interface LinkmlClass {
  name: string;
  description?: string;
  slots: EffectiveSlot[];
}

export interface LinkmlEnum {
  name: string;
  permissibleValues: string[];
}

export interface Relationship {
  fromClass: string;
  slotName: string;
  toClass: string;
  cardinality: Cardinality;
  /** Set when a mutual inverse pair collapsed into this edge. The edge is
      emitted from the pair's lexicographically first (class, slot). */
  inverseSlotName?: string;
}

export interface InheritanceEdge {
  child: string;
  parent: string;
  kind: 'is_a' | 'mixin';
}

export interface EnumReference {
  fromClass: string;
  slotName: string;
  enumName: string;
}

export interface LinkmlGraph {
  classes: LinkmlClass[];
  enums: LinkmlEnum[];
  relationships: Relationship[];
  inheritance: InheritanceEdge[];
  enumReferences: EnumReference[];
}

export type ParseResult =
  | { ok: true; graph: LinkmlGraph }
  | { ok: false; error: string };

/** LinkML's own fallback when a schema declares no default_range. */
const IMPLICIT_DEFAULT_RANGE = 'string';

type Record_ = Record<string, unknown>;

/** A slot before its range is classified as row, relationship, or enum reference. */
interface ResolvedSlot {
  name: string;
  range: string;
  cardinality: Cardinality;
  inverse?: string;
}

interface RelationshipCandidate extends ResolvedSlot {
  fromClass: string;
}

export function parseLinkmlSchema(content: string): ParseResult {
  let root: unknown;
  try {
    root = parse(content);
  } catch (error) {
    return { ok: false, error: messageOf(error) };
  }
  const schema = asRecord(root);
  if (!schema) return { ok: false, error: 'schema root is not a YAML mapping' };

  const defaultRange = asString(schema.default_range) ?? IMPLICIT_DEFAULT_RANGE;
  const topLevelSlots = asRecord(schema.slots) ?? emptyRecord();
  const enums = readEnums(schema.enums);
  const classBodies = readClassBodies(schema.classes);
  const classNames = new Set(classBodies.map(([name]) => name));
  const enumNames = new Set(enums.map((declared) => declared.name));

  const classes: LinkmlClass[] = [];
  const inheritance: InheritanceEdge[] = [];
  const enumReferences: EnumReference[] = [];
  const candidates: RelationshipCandidate[] = [];

  for (const [className, body] of classBodies) {
    const slots: EffectiveSlot[] = [];
    for (const slot of resolveSlots(body, topLevelSlots, defaultRange)) {
      if (classNames.has(slot.range)) {
        candidates.push({ ...slot, fromClass: className });
        continue;
      }
      slots.push({
        name: slot.name,
        range: slot.range,
        cardinality: slot.cardinality,
      });
      if (enumNames.has(slot.range)) {
        enumReferences.push({
          fromClass: className,
          slotName: slot.name,
          enumName: slot.range,
        });
      }
    }
    const linkmlClass: LinkmlClass = { name: className, slots };
    const description = asString(body.description);
    if (description !== undefined) linkmlClass.description = description;
    classes.push(linkmlClass);
    inheritance.push(...inheritanceEdges(className, body));
  }

  return {
    ok: true,
    graph: {
      classes,
      enums,
      relationships: collapseInverses(candidates),
      inheritance,
      enumReferences,
    },
  };
}

/** Referenced top-level slots first, then inline attributes; slot_usage refines both. */
function resolveSlots(
  body: Record_,
  topLevelSlots: Record_,
  defaultRange: string,
): ResolvedSlot[] {
  const usage = asRecord(body.slot_usage) ?? emptyRecord();
  const refine = (name: string, base: unknown): ResolvedSlot =>
    toResolvedSlot(
      name,
      Object.assign(
        emptyRecord(),
        asRecord(base),
        asRecord(usage[name]),
      ) as Record_,
      defaultRange,
    );

  return [
    ...stringList(body.slots).map((name) => refine(name, topLevelSlots[name])),
    ...recordEntries(body.attributes).map(([name, definition]) =>
      refine(name, definition),
    ),
  ];
}

function toResolvedSlot(
  name: string,
  definition: Record_,
  defaultRange: string,
): ResolvedSlot {
  const slot: ResolvedSlot = {
    name,
    range: asString(definition.range) ?? defaultRange,
    cardinality: cardinalityOf(
      definition.required === true,
      definition.multivalued === true,
    ),
  };
  const inverse = asString(definition.inverse);
  if (inverse !== undefined) slot.inverse = inverse;
  return slot;
}

function cardinalityOf(required: boolean, multivalued: boolean): Cardinality {
  if (required) return multivalued ? '1..*' : '1';
  return multivalued ? '0..*' : '0..1';
}

function inheritanceEdges(className: string, body: Record_): InheritanceEdge[] {
  const edges: InheritanceEdge[] = [];
  const parent = asString(body.is_a);
  if (parent !== undefined) {
    edges.push({ child: className, parent, kind: 'is_a' });
  }
  for (const mixin of stringList(body.mixins)) {
    edges.push({ child: className, parent: mixin, kind: 'mixin' });
  }
  return edges;
}

/**
 * A mutual inverse pair becomes one edge, emitted from the lexicographically
 * first (class, slot). Dangling and asymmetric inverses fall through as
 * ordinary directed edges — tolerated input, not an error.
 */
function collapseInverses(candidates: RelationshipCandidate[]): Relationship[] {
  const relationships: Relationship[] = [];
  for (const candidate of candidates) {
    const partner = candidates.find((other) =>
      isMutualInverse(candidate, other),
    );
    if (partner && precedes(partner, candidate)) continue;
    const relationship: Relationship = {
      fromClass: candidate.fromClass,
      slotName: candidate.name,
      toClass: candidate.range,
      cardinality: candidate.cardinality,
    };
    if (partner) relationship.inverseSlotName = partner.name;
    relationships.push(relationship);
  }
  return relationships;
}

function isMutualInverse(
  a: RelationshipCandidate,
  b: RelationshipCandidate,
): boolean {
  return (
    a.inverse === b.name &&
    b.inverse === a.name &&
    a.fromClass === b.range &&
    b.fromClass === a.range
  );
}

function precedes(a: RelationshipCandidate, b: RelationshipCandidate): boolean {
  if (a.fromClass !== b.fromClass) return a.fromClass < b.fromClass;
  return a.name < b.name;
}

function readEnums(value: unknown): LinkmlEnum[] {
  return recordEntries(value).map(([name, body]) => ({
    name,
    permissibleValues: recordEntries(asRecord(body)?.permissible_values).map(
      ([permissible]) => permissible,
    ),
  }));
}

function readClassBodies(value: unknown): [string, Record_][] {
  return recordEntries(value).map(([name, body]): [string, Record_] => [
    name,
    asRecord(body) ?? emptyRecord(),
  ]);
}

function recordEntries(value: unknown): [string, unknown][] {
  return Object.entries(asRecord(value) ?? emptyRecord());
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter(isString) : [];
}

/**
 * Narrows a YAML node to a mapping, copied onto a null prototype so a schema
 * declaring a slot named `constructor` or `toString` reads as data rather
 * than as Object.prototype.
 */
function asRecord(value: unknown): Record_ | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  return Object.assign(emptyRecord(), value);
}

function emptyRecord(): Record_ {
  return Object.create(null) as Record_;
}

function asString(value: unknown): string | undefined {
  return isString(value) ? value : undefined;
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
