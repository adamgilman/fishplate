import { GitBranch } from 'lucide-react';
import { BaseNode } from './base-node';
import type { NodeProps, Node } from '@xyflow/react';
import type { WorkflowNodeData } from '@/lib/graph-layout';

export function DecisionNode({ data }: NodeProps<Node<WorkflowNodeData>>) {
  const conditions = data.edges
    .filter(e => e.when)
    .map(e => e.when!);

  return (
    <BaseNode data={data} shape="diamond" className="bg-zinc-900/80">
      <div className="-rotate-45">
        <div className="flex items-center gap-2 justify-center">
          <GitBranch className="w-4 h-4 text-zinc-400" />
          <span className="text-sm font-medium text-zinc-200">Decision</span>
        </div>
        {conditions.length > 0 && (
          <div className="mt-1 space-y-0.5">
            {conditions.map((c, i) => (
              <div key={i} className="text-xs text-zinc-500 font-mono truncate max-w-[180px]">{c}</div>
            ))}
          </div>
        )}
        <div className="text-xs text-zinc-500 mt-1">{data.definition.id}</div>
      </div>
    </BaseNode>
  );
}
