/**
 * The LinkML projection (DESIGN.md "LinkML Graph Viewer"): normalizes a
 * LinkML YAML string — inline attributes, top-level slot references,
 * slot_usage merges — into one effective-slots graph model. Pure: no
 * React, no IO. Boundary handling only, never LinkML validation.
 */

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

export function parseLinkmlSchema(_content: string): ParseResult {
  throw new Error('not implemented: parseLinkmlSchema');
}
