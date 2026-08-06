/**
 * Graph model → React Flow props (DESIGN.md "LinkML Graph Viewer").
 * Pure data mapping: node id = class/enum name, edge sourceHandle = slot
 * name. Positions default to the origin — placement is layout's job.
 */
import type { Edge, Node } from '@xyflow/react';

import type {
  Cardinality,
  EffectiveSlot,
  LinkmlGraph,
} from './linkml-model';

export const NODE_TYPE_CLASS = 'linkml-class';
export const NODE_TYPE_ENUM = 'linkml-enum';
export const EDGE_TYPE_RELATIONSHIP = 'relationship';
export const EDGE_TYPE_INHERITANCE = 'inheritance';
export const EDGE_TYPE_ENUM_REF = 'enum-ref';

export type ClassNodeData = {
  name: string;
  description?: string;
  rows: EffectiveSlot[];
};

export type EnumNodeData = {
  name: string;
  values: string[];
};

export type RelationshipEdgeData = {
  slotName: string;
  cardinality: Cardinality;
  inverseSlotName?: string;
};

export type InheritanceEdgeData = {
  kind: 'is_a' | 'mixin';
};

export type EnumRefEdgeData = {
  slotName: string;
};

const ORIGIN = { x: 0, y: 0 };

export function toFlowGraph(graph: LinkmlGraph): {
  nodes: Node[];
  edges: Edge[];
} {
  const nodes: Node[] = [
    ...graph.classes.map((cls) => ({
      id: cls.name,
      type: NODE_TYPE_CLASS,
      position: { ...ORIGIN },
      data: {
        name: cls.name,
        description: cls.description,
        rows: cls.slots,
      } satisfies ClassNodeData,
    })),
    ...graph.enums.map((enm) => ({
      id: enm.name,
      type: NODE_TYPE_ENUM,
      position: { ...ORIGIN },
      data: {
        name: enm.name,
        values: enm.permissibleValues,
      } satisfies EnumNodeData,
    })),
  ];

  const edges: Edge[] = [
    ...graph.relationships.map((rel) => ({
      id: `rel:${rel.fromClass}.${rel.slotName}`,
      type: EDGE_TYPE_RELATIONSHIP,
      source: rel.fromClass,
      sourceHandle: rel.slotName,
      target: rel.toClass,
      data: {
        slotName: rel.slotName,
        cardinality: rel.cardinality,
        inverseSlotName: rel.inverseSlotName,
      } satisfies RelationshipEdgeData,
    })),
    ...graph.inheritance.map((edge) => ({
      id: `inh:${edge.child}.${edge.kind}.${edge.parent}`,
      type: EDGE_TYPE_INHERITANCE,
      source: edge.child,
      target: edge.parent,
      data: { kind: edge.kind } satisfies InheritanceEdgeData,
    })),
    ...graph.enumReferences.map((ref) => ({
      id: `enum:${ref.fromClass}.${ref.slotName}`,
      type: EDGE_TYPE_ENUM_REF,
      source: ref.fromClass,
      sourceHandle: ref.slotName,
      target: ref.enumName,
      data: { slotName: ref.slotName } satisfies EnumRefEdgeData,
    })),
  ];

  return { nodes, edges };
}
