import { Play } from 'lucide-react';
import { BaseNode } from './base-node';
import type { NodeProps, Node } from '@xyflow/react';
import type { WorkflowNodeData } from '@/lib/graph-layout';

export function ActionNode({ data }: NodeProps<Node<WorkflowNodeData>>) {
  return (
    <BaseNode data={data}>
      <div className="flex items-center gap-2 justify-center">
        <Play className="w-4 h-4 text-zinc-400" />
        <span className="text-sm font-medium text-zinc-200">{data.definition.handler}</span>
      </div>
      <div className="text-xs text-zinc-500 mt-1">{data.definition.id}</div>
    </BaseNode>
  );
}
