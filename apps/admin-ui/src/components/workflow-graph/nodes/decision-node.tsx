import { GitBranch } from 'lucide-react';
import { BaseNode } from './base-node';
import type { NodeProps, Node } from '@xyflow/react';
import type { WorkflowNodeData } from '@/lib/graph-layout';

export function DecisionNode({ data }: NodeProps<Node<WorkflowNodeData>>) {
  const conditions = data.edges
    .filter(e => e.when)
    .map(e => e.when!);

  return (
    <BaseNode data={data} shape="diamond" className="bg-zinc-900/80 border-dashed">
      <div className="flex items-center gap-2 justify-center">
        <GitBranch className="w-4 h-4 text-zinc-400" />
        <span className="text-sm font-medium text-zinc-200">{data.definition.id}</span>
      </div>
      {conditions.length > 0 && (
        <div className="text-xs text-zinc-500 mt-1">{conditions.length} condition{conditions.length > 1 ? 's' : ''}</div>
      )}
    </BaseNode>
  );
}
