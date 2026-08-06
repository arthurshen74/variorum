/**
 * A LinkML class as a React Flow node (DESIGN.md "LinkML Graph Viewer"):
 * a name header over one row per scalar/enum slot. Class-range slots are
 * edges rather than rows, so they contribute an unlabeled handle on the
 * right edge instead — the anchor their edge names in `sourceHandle`.
 */
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';

import type { ClassNodeData } from './flow-graph';

/** Slot names whose edges leave this node without a row to anchor to. */
export type ClassNodeExtras = { relationHandles: string[] };

export type ClassFlowNode = Node<ClassNodeData & ClassNodeExtras>;

export function ClassNode({ data }: NodeProps<ClassFlowNode>) {
  const { name, description, rows, relationHandles } = data;

  return (
    <div className="min-w-40 rounded-md border bg-card text-card-foreground shadow-sm">
      <Handle type="target" position={Position.Left} className="!bg-border" />
      <Handle type="source" position={Position.Right} className="!bg-border" />
      {relationHandles.map((slotName, index) => (
        <Handle
          key={slotName}
          id={slotName}
          type="source"
          position={Position.Right}
          className="!bg-border"
          style={{ top: `${((index + 1) / (relationHandles.length + 1)) * 100}%` }}
        />
      ))}

      <div className="rounded-t-md border-b bg-muted px-2 py-1 text-xs font-semibold">
        {name}
      </div>
      {description === undefined ? null : (
        <div className="px-2 pt-1 text-[10px] text-muted-foreground">
          {description}
        </div>
      )}
      <div className="py-1">
        {rows.map((row) => (
          <div
            key={row.name}
            className="relative flex items-center gap-2 px-2 py-0.5 text-[11px]"
          >
            <span>{row.name}</span>
            <span className="ml-auto text-muted-foreground">{row.range}</span>
            <span className="text-muted-foreground">{row.cardinality}</span>
            <Handle
              id={row.name}
              type="source"
              position={Position.Right}
              className="!bg-border"
            />
          </div>
        ))}
      </div>
    </div>
  );
}
