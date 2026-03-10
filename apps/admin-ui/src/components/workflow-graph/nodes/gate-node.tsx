import { ShieldHalf } from 'lucide-react';
import { BaseNode } from './base-node';
import type { NodeProps, Node } from '@xyflow/react';
import type { WorkflowNodeData } from '@/lib/graph-layout';

export function GateNode({ data }: NodeProps<Node<WorkflowNodeData>>) {
  const timeoutMs = data.definition.timeoutMs;
  const timeoutDisplay = timeoutMs
    ? `timeout: ${(timeoutMs / 1000).toFixed(0)}s`
    : 'No timeout';

  return (
    <BaseNode data={data}>
      <div className="flex items-center gap-2 justify-center">
        <ShieldHalf className="w-4 h-4 text-zinc-400" />
        <span className="text-sm font-medium text-zinc-200">Gate</span>
      </div>
      <div className="text-xs text-zinc-500 mt-1">{timeoutDisplay}</div>
      <div className="text-xs text-zinc-500 mt-1">{data.definition.id}</div>
    </BaseNode>
  );
}
