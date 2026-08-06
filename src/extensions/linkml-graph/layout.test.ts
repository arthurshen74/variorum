/**
 * [G2] ELK placement (DESIGN.md "LinkML Graph Viewer"): saved positions
 * win; unplaced nodes get laid out; saved = {} is the auto-arrange path.
 */
import { describe, expect, it } from 'vitest';

import { layoutGraph, type MeasuredNode, type LayoutEdge } from './layout';

const nodes: MeasuredNode[] = [
  { id: 'A', width: 200, height: 100 },
  { id: 'B', width: 200, height: 120 },
  { id: 'C', width: 180, height: 80 },
];
const edges: LayoutEdge[] = [{ id: 'e1', source: 'A', target: 'B' }];

describe('[G2] layoutGraph', () => {
  it('returns a finite position for every node', async () => {
    const positions = await layoutGraph(nodes, edges, {});
    for (const node of nodes) {
      const p = positions[node.id];
      expect(p).toBeDefined();
      expect(Number.isFinite(p?.x)).toBe(true);
      expect(Number.isFinite(p?.y)).toBe(true);
    }
  });

  it('returns saved positions unchanged', async () => {
    const saved = { A: { x: 42, y: 24 } };
    const positions = await layoutGraph(nodes, edges, saved);
    expect(positions.A).toEqual({ x: 42, y: 24 });
  });

  it('places unplaced nodes at mutually distinct positions', async () => {
    const positions = await layoutGraph(nodes, edges, {});
    const spots = new Set(
      nodes.map((n) => `${positions[n.id]?.x},${positions[n.id]?.y}`),
    );
    expect(spots.size).toBe(nodes.length);
  });

  it('saved = {} lays out every node afresh — the auto-arrange path', async () => {
    const positions = await layoutGraph(nodes, edges, {});
    expect(Object.keys(positions).sort()).toEqual(['A', 'B', 'C']);
  });
});
