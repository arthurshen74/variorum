/**
 * ELK layered placement (DESIGN.md "LinkML Graph Viewer"). Saved
 * positions always win; unplaced nodes are laid out with the placed ones
 * as fixed hints. Auto-arrange = call with saved = {}.
 */
import ELK from 'elkjs/lib/elk.bundled.js';

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

const LAYOUT_OPTIONS: Record<string, string> = {
  'elk.algorithm': 'layered',
  'elk.direction': 'RIGHT',
  'elk.layered.spacing.nodeNodeBetweenLayers': '120',
  'elk.spacing.nodeNode': '60',
};

/** Saved geometry steers ordering instead of being reshuffled away. */
const INTERACTIVE_OPTIONS: Record<string, string> = {
  'elk.interactive': 'true',
  'elk.layered.cycleBreaking.strategy': 'INTERACTIVE',
  'elk.layered.crossingMinimization.strategy': 'INTERACTIVE',
  'elk.layered.nodePlacement.strategy': 'INTERACTIVE',
  'elk.layered.layering.strategy': 'INTERACTIVE',
};

const elk = new ELK();

/** Returns a position for EVERY node. */
export async function layoutGraph(
  nodes: MeasuredNode[],
  edges: LayoutEdge[],
  saved: Positions,
): Promise<Positions> {
  const anySaved = nodes.some((node) => saved[node.id]);

  const laidOut = await elk.layout({
    id: 'root',
    layoutOptions: anySaved
      ? { ...LAYOUT_OPTIONS, ...INTERACTIVE_OPTIONS }
      : LAYOUT_OPTIONS,
    children: nodes.map((node) => ({
      id: node.id,
      width: node.width,
      height: node.height,
      ...saved[node.id],
    })),
    edges: edges.map((edge) => ({
      id: edge.id,
      sources: [edge.source],
      targets: [edge.target],
    })),
  });

  const computed: Positions = {};
  for (const child of laidOut.children ?? []) {
    computed[child.id] = { x: child.x ?? 0, y: child.y ?? 0 };
  }

  const offset = meanOffset(saved, computed);
  const positions: Positions = {};
  for (const node of nodes) {
    const savedPosition = saved[node.id];
    if (savedPosition) {
      positions[node.id] = savedPosition;
      continue;
    }
    const spot = computed[node.id] ?? { x: 0, y: 0 };
    positions[node.id] = { x: spot.x + offset.x, y: spot.y + offset.y };
  }
  return positions;
}

/**
 * Average saved-minus-computed delta over the placed nodes: it translates
 * fresh nodes onto the human's existing layout instead of ELK's origin.
 */
function meanOffset(
  saved: Positions,
  computed: Positions,
): { x: number; y: number } {
  let count = 0;
  let x = 0;
  let y = 0;
  for (const [id, position] of Object.entries(saved)) {
    const spot = computed[id];
    if (!spot) continue;
    x += position.x - spot.x;
    y += position.y - spot.y;
    count += 1;
  }
  return count === 0 ? { x: 0, y: 0 } : { x: x / count, y: y / count };
}
