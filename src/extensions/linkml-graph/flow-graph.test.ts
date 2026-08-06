/**
 * [G2] Graph model → React Flow props (DESIGN.md "LinkML Graph Viewer"):
 * node/edge types, ids, slot-row handles, and edge label data.
 */
import { describe, expect, it } from 'vitest';

import {
  EDGE_TYPE_ENUM_REF,
  EDGE_TYPE_INHERITANCE,
  EDGE_TYPE_RELATIONSHIP,
  NODE_TYPE_CLASS,
  NODE_TYPE_ENUM,
  toFlowGraph,
} from './flow-graph';
import type { LinkmlGraph } from './linkml-model';

const graph: LinkmlGraph = {
  classes: [
    {
      name: 'Person',
      slots: [{ name: 'name', range: 'string', cardinality: '0..1' }],
    },
    { name: 'Dog', slots: [] },
  ],
  enums: [{ name: 'Status', permissibleValues: ['ACTIVE', 'RETIRED'] }],
  relationships: [
    {
      fromClass: 'Person',
      slotName: 'pets',
      toClass: 'Dog',
      cardinality: '0..*',
      inverseSlotName: 'owner',
    },
  ],
  inheritance: [{ child: 'Dog', parent: 'Person', kind: 'is_a' }],
  enumReferences: [
    { fromClass: 'Person', slotName: 'status', enumName: 'Status' },
  ],
};

describe('[G2] toFlowGraph', () => {
  it('classes map to class nodes: id = name, rows in data', () => {
    const { nodes } = toFlowGraph(graph);
    const person = nodes.find((n) => n.id === 'Person');
    expect(person?.type).toBe(NODE_TYPE_CLASS);
    expect(person?.data).toMatchObject({
      rows: [{ name: 'name', range: 'string', cardinality: '0..1' }],
    });
  });

  it('enums map to enum nodes with their permissible values', () => {
    const { nodes } = toFlowGraph(graph);
    const status = nodes.find((n) => n.id === 'Status');
    expect(status?.type).toBe(NODE_TYPE_ENUM);
    expect(status?.data).toMatchObject({ values: ['ACTIVE', 'RETIRED'] });
  });

  it('relationships map to relationship edges anchored at the slot row', () => {
    const { edges } = toFlowGraph(graph);
    const rel = edges.find((e) => e.type === EDGE_TYPE_RELATIONSHIP);
    expect(rel).toMatchObject({
      source: 'Person',
      sourceHandle: 'pets',
      target: 'Dog',
    });
    expect(rel?.data).toMatchObject({
      cardinality: '0..*',
      inverseSlotName: 'owner',
    });
  });

  it('inheritance maps to inheritance edges, child to parent', () => {
    const { edges } = toFlowGraph(graph);
    const inh = edges.find((e) => e.type === EDGE_TYPE_INHERITANCE);
    expect(inh).toMatchObject({ source: 'Dog', target: 'Person' });
  });

  it('enum references map to enum-ref edges anchored at the slot row', () => {
    const { edges } = toFlowGraph(graph);
    const ref = edges.find((e) => e.type === EDGE_TYPE_ENUM_REF);
    expect(ref).toMatchObject({
      source: 'Person',
      sourceHandle: 'status',
      target: 'Status',
    });
  });
});
