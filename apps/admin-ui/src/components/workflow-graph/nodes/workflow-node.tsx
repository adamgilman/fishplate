import { Workflow } from 'lucide-react';
import { BaseNode } from './base-node';
import type { NodeProps, Node } from '@xyflow/react';
import type { WorkflowNodeData } from '@/lib/graph-layout';

export function WorkflowNode({ data }: NodeProps<Node<WorkflowNodeData>>) {
  return (
    <BaseNode data={data} className="border-dashed">
      <div className="flex items-center gap-2 justify-center">
        <Workflow className="w-4 h-4 text-zinc-400" />
        <span className="text-sm font-medium text-zinc-200">{data.definition.workflowRef}</span>
      </div>
      {data.definition.workflowVersion && (
        <div className="text-xs text-zinc-500 mt-1">v{data.definition.workflowVersion}</div>
      )}
      <div className="text-xs text-zinc-500 mt-1">{data.definition.id}</div>
    </BaseNode>
  );
}
