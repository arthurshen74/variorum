/**
 * The LinkML graph viewer (DESIGN.md "LinkML Graph Viewer"): a read-only
 * React Flow rendering of the artifact. Never calls onChange — layout
 * interaction is presentation, not artifact data.
 *
 * It composes the pure modules of this extension: the projection
 * (linkml-model), the React Flow mapping (flow-graph), the ELK placement
 * (layout), and persists placement as device state (device-state). A
 * failed parse replaces the canvas with the parser's message — never a
 * graph, which would read as a picture of the current artifact.
 * Nodes stay invisible until placed, so no frame ever shows the stack of
 * nodes sitting at the origin awaiting measurement.
 */
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import {
  Background,
  Controls,
  MarkerType,
  ReactFlow,
  applyNodeChanges,
  type Edge,
  type EdgeTypes,
  type Node,
  type NodeChange,
  type NodeTypes,
  type ReactFlowInstance,
  type Viewport,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import type { EditorProps } from '../extension';
import { ClassNode } from './ClassNode';
import { EnumNode } from './EnumNode';
import { RelationshipEdge } from './RelationshipEdge';
import {
  EDGE_TYPE_INHERITANCE,
  EDGE_TYPE_RELATIONSHIP,
  NODE_TYPE_CLASS,
  NODE_TYPE_ENUM,
  toFlowGraph,
  type InheritanceEdgeData,
} from './flow-graph';
import {
  loadDeviceState,
  saveDeviceState,
  type GraphDeviceState,
} from './device-state';
import { layoutGraph, type MeasuredNode, type Positions } from './layout';
import { parseLinkmlSchema } from './linkml-model';

const nodeTypes: NodeTypes = {
  [NODE_TYPE_CLASS]: ClassNode,
  [NODE_TYPE_ENUM]: EnumNode,
};

const edgeTypes: EdgeTypes = {
  [EDGE_TYPE_RELATIONSHIP]: RelationshipEdge,
};

const PARSE_ERROR_HEADING = "This artifact isn't valid YAML";
const VIEWPORT_SAVE_DELAY_MS = 150;
const HIDDEN = { visibility: 'hidden' } as const;

// React Flow's controls only follow a `dark` class on its own container,
// not the app's <html> one — mapping its variables onto the theme tokens
// keeps them legible in both themes.
const FLOW_THEME = {
  '--xy-controls-button-background-color': 'var(--card)',
  '--xy-controls-button-background-color-hover': 'var(--accent)',
  '--xy-controls-button-color': 'var(--card-foreground)',
  '--xy-controls-button-color-hover': 'var(--accent-foreground)',
  '--xy-controls-button-border-color': 'var(--border)',
} as CSSProperties;

interface FlowGraph {
  nodes: Node[];
  edges: Edge[];
}

const EMPTY_FLOW: FlowGraph = { nodes: [], edges: [] };

interface ViewState {
  unitId: string;
  /** Identity of the mapping this view was built from. */
  source: FlowGraph;
  nodes: Node[];
  edges: Edge[];
  /** Node ids awaiting their first placement. */
  pending: string[];
  device: GraphDeviceState;
}

export default function LinkmlGraphViewer({ content, context }: EditorProps) {
  const { unitId } = context;

  const parsed = useMemo(() => parseLinkmlSchema(content), [content]);
  const flow = useMemo(
    () => (parsed.ok ? toFlowGraph(parsed.graph) : EMPTY_FLOW),
    [parsed],
  );

  const [view, setView] = useState<ViewState>(() => freshView(unitId, flow));
  if (view.unitId !== unitId) {
    // The view belongs to the unit, not to the tab.
    setView(freshView(unitId, flow));
  } else if (view.source !== flow) {
    setView(remappedView(view, flow));
  }

  const stateRef = useRef(view);
  stateRef.current = view;
  const instanceRef = useRef<ReactFlowInstance<Node, Edge> | null>(null);
  const laying = useRef(false);
  const viewportTimer = useRef<number | undefined>(undefined);

  function persist(positions: Positions, viewport?: Viewport): void {
    const device: GraphDeviceState = {
      positions,
      viewport: viewport ?? stateRef.current.device.viewport,
    };
    saveDeviceState(unitId, device);
    setView((current) => ({ ...current, device }));
  }

  async function runLayout(saved: Positions, fit: boolean): Promise<void> {
    laying.current = true;
    const current = stateRef.current;
    const positions = await layoutGraph(
      measuredNodes(current.nodes),
      current.edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
      })),
      saved,
    );
    setView((state) => ({
      ...state,
      nodes: state.nodes.map((node) => ({
        ...node,
        position: positions[node.id] ?? node.position,
        style: undefined,
      })),
      pending: [],
    }));
    if (fit) await instanceRef.current?.fitView();
    persist(positions, instanceRef.current?.getViewport());
    laying.current = false;
  }

  // Two-pass placement: React Flow measures the mounted nodes, then ELK
  // places the ones without a position of their own.
  useEffect(() => {
    if (view.pending.length === 0 || laying.current) return;
    if (measuredNodes(view.nodes).length !== view.nodes.length) return;
    void runLayout(placedPositions(view), view.device.viewport === undefined);
  }, [view]);

  if (!parsed.ok) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6">
        <p className="text-sm font-medium">{PARSE_ERROR_HEADING}</p>
        <pre className="max-w-full overflow-auto text-xs text-muted-foreground">
          {parsed.error}
        </pre>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-8 shrink-0 items-center justify-end border-b px-2">
        <button
          type="button"
          onClick={() => {
            void runLayout({}, true);
          }}
          className="rounded-md border px-2 py-0.5 text-xs font-medium hover:bg-accent"
        >
          Auto-arrange
        </button>
      </div>
      <div className="min-h-0 flex-1">
        <ReactFlow
          style={FLOW_THEME}
          nodes={view.nodes}
          edges={view.edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          nodesConnectable={false}
          defaultViewport={view.device.viewport}
          onInit={(instance) => {
            instanceRef.current = instance;
          }}
          onNodesChange={(changes: NodeChange[]) => {
            setView((current) => ({
              ...current,
              nodes: applyNodeChanges(changes, current.nodes),
            }));
          }}
          onNodeDragStop={() => {
            persist(placedPositions(stateRef.current));
          }}
          onMoveEnd={(_, viewport) => {
            window.clearTimeout(viewportTimer.current);
            viewportTimer.current = window.setTimeout(() => {
              persist(placedPositions(stateRef.current), viewport);
            }, VIEWPORT_SAVE_DELAY_MS);
          }}
        >
          <Background />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
    </div>
  );
}

function freshView(unitId: string, flow: FlowGraph): ViewState {
  const device = loadDeviceState(unitId);
  return {
    unitId,
    source: flow,
    ...placeNodes(flow, device.positions, []),
    edges: decorateEdges(flow.edges),
    device,
  };
}

/**
 * A re-parse keeps the placement the human sees; only new nodes are
 * pending. Saved positions sit underneath the live ones so a class that
 * left the schema and came back lands where it used to.
 */
function remappedView(view: ViewState, flow: FlowGraph): ViewState {
  const known = { ...view.device.positions, ...positionsOf(view.nodes) };
  return {
    ...view,
    source: flow,
    ...placeNodes(flow, known, view.nodes),
    edges: decorateEdges(flow.edges),
  };
}

function placeNodes(
  flow: FlowGraph,
  known: Positions,
  previous: Node[],
): { nodes: Node[]; pending: string[] } {
  const handles = relationHandles(flow.edges);
  const pending: string[] = [];
  const nodes = flow.nodes.map((node) => {
    const position = known[node.id];
    if (position === undefined) pending.push(node.id);
    return {
      ...node,
      data: { ...node.data, relationHandles: handles[node.id] ?? [] },
      position: position ?? { x: 0, y: 0 },
      measured: previous.find((seen) => seen.id === node.id)?.measured,
      style: position === undefined ? HIDDEN : undefined,
    };
  });
  return { nodes, pending };
}

/** Class-range slots are edges, not rows: their handles come from the edges. */
function relationHandles(edges: Edge[]): Record<string, string[]> {
  const handles: Record<string, string[]> = {};
  for (const edge of edges) {
    if (edge.type !== EDGE_TYPE_RELATIONSHIP || !edge.sourceHandle) continue;
    handles[edge.source] = [...(handles[edge.source] ?? []), edge.sourceHandle];
  }
  return handles;
}

/** Inheritance and enum references are styling only — no custom renderer. */
function decorateEdges(edges: Edge[]): Edge[] {
  return edges.map((edge) => {
    if (edge.type === EDGE_TYPE_RELATIONSHIP) {
      return {
        ...edge,
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: 'var(--muted-foreground)',
        },
      };
    }
    if (edge.type === EDGE_TYPE_INHERITANCE) {
      const inheritance = edge.data as InheritanceEdgeData | undefined;
      return {
        ...edge,
        type: 'smoothstep',
        markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--foreground)' },
        style: {
          stroke: 'var(--foreground)',
          strokeDasharray: inheritance?.kind === 'mixin' ? '6 4' : undefined,
        },
      };
    }
    return {
      ...edge,
      type: 'default',
      style: {
        stroke: 'var(--muted-foreground)',
        strokeDasharray: '2 4',
        opacity: 0.6,
      },
    };
  });
}

function measuredNodes(nodes: Node[]): MeasuredNode[] {
  const measured: MeasuredNode[] = [];
  for (const node of nodes) {
    const size = node.measured;
    if (size?.width === undefined || size.height === undefined) continue;
    measured.push({ id: node.id, width: size.width, height: size.height });
  }
  return measured;
}

/** Positions of every node ELK must leave where it is. */
function placedPositions(view: ViewState): Positions {
  const positions = positionsOf(view.nodes);
  for (const id of view.pending) delete positions[id];
  return positions;
}

function positionsOf(nodes: Node[]): Positions {
  const positions: Positions = {};
  for (const node of nodes) positions[node.id] = node.position;
  return positions;
}
