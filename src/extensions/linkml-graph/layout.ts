/**
 * ELK layered placement (DESIGN.md "LinkML Graph Viewer"). Saved
 * positions always win; unplaced nodes are laid out with the placed ones
 * as fixed hints. Auto-arrange = call with saved = {}.
 */

export interface MeasuredNode {
  id: string;
  width: number;
  height: number;
}

export interface LayoutEdge {
  id: string;
  source: string;
  target: string;
}

export type Positions = Record<string, { x: number; y: number }>;

/** Returns a position for EVERY node. */
export function layoutGraph(
  _nodes: MeasuredNode[],
  _edges: LayoutEdge[],
  _saved: Positions,
): Promise<Positions> {
  throw new Error('not implemented: layoutGraph');
}
