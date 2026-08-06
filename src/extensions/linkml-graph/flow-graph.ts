/**
 * Graph model → React Flow props (DESIGN.md "LinkML Graph Viewer").
 * Pure data mapping: node id = class/enum name, edge sourceHandle = slot
 * name. Positions default to the origin — placement is layout's job.
 */
import type { Edge, Node } from '@xyflow/react';

import type { LinkmlGraph } from './linkml-model';

export const NODE_TYPE_CLASS = 'linkml-class';
export const NODE_TYPE_ENUM = 'linkml-enum';
export const EDGE_TYPE_RELATIONSHIP = 'relationship';
export const EDGE_TYPE_INHERITANCE = 'inheritance';
export const EDGE_TYPE_ENUM_REF = 'enum-ref';

export function toFlowGraph(_graph: LinkmlGraph): {
  nodes: Node[];
  edges: Edge[];
} {
  throw new Error('not implemented: toFlowGraph');
}
