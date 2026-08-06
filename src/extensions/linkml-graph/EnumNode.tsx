/**
 * A LinkML enum as a React Flow node (DESIGN.md "LinkML Graph Viewer"):
 * a name header over its permissible values.
 */
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';

import type { EnumNodeData } from './flow-graph';

export type EnumFlowNode = Node<EnumNodeData>;

export function EnumNode({ data }: NodeProps<EnumFlowNode>) {
  return (
    <div className="min-w-32 rounded-md border border-dashed bg-card text-card-foreground shadow-sm">
      <Handle type="target" position={Position.Left} className="!bg-border" />
      <div className="rounded-t-md border-b border-dashed bg-muted px-2 py-1 text-xs font-semibold italic">
        {data.name}
      </div>
      <div className="py-1">
        {data.values.map((value) => (
          <div key={value} className="px-2 py-0.5 text-[11px]">
            {value}
          </div>
        ))}
      </div>
    </div>
  );
}
