/**
 * A class-range slot as an edge (DESIGN.md "LinkML Graph Viewer"): the
 * slot name and its cardinality at the middle, and — when a mutual
 * inverse pair collapsed into this one edge — the other side's slot name
 * at the target end.
 */
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type Edge,
  type EdgeProps,
} from '@xyflow/react';

import type { RelationshipEdgeData } from './flow-graph';

export type RelationshipFlowEdge = Edge<RelationshipEdgeData>;

const LABEL_CLASS =
  'pointer-events-none absolute rounded border bg-card px-1 text-[10px] text-card-foreground';

export function RelationshipEdge({
  sourceX,
  sourceY,
  sourcePosition,
  targetX,
  targetY,
  targetPosition,
  markerEnd,
  data,
}: EdgeProps<RelationshipFlowEdge>) {
  const [path, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  return (
    <>
      <BaseEdge
        path={path}
        markerEnd={markerEnd}
        style={{ stroke: 'var(--muted-foreground)' }}
      />
      <EdgeLabelRenderer>
        <div
          className={LABEL_CLASS}
          style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
        >
          {data?.slotName} {data?.cardinality}
        </div>
        {data?.inverseSlotName === undefined ? null : (
          <div
            className={LABEL_CLASS}
            style={{
              transform: `translate(-100%, -50%) translate(${targetX}px, ${targetY}px)`,
            }}
          >
            {data.inverseSlotName}
          </div>
        )}
      </EdgeLabelRenderer>
    </>
  );
}
