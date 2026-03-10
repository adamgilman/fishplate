import { Handle, Position } from '@xyflow/react';
import { cn } from '@/lib/utils';
import type { NodeProps, Node } from '@xyflow/react';
import type { WorkflowNodeData } from '@/lib/graph-layout';

const statusStyles: Record<string, string> = {
  completed: 'border-emerald-500 bg-emerald-500/10',
  running: 'border-blue-500 bg-blue-500/10 animate-pulse',
  failed: 'border-red-500 bg-red-500/10',
  waiting: 'border-amber-500 bg-amber-500/10 animate-pulse',
  pending: 'border-zinc-700 bg-zinc-800/50 opacity-50',
};

export function TerminalNode({ data }: NodeProps<Node<WorkflowNodeData>>) {
  const isStart = data.isEntrypoint;
  const status = data.executionState.status;
  const label = isStart ? 'Start' : 'End';

  return (
    <div
      className={cn(
        'border-2 rounded-full w-16 h-16 flex flex-col items-center justify-center',
        statusStyles[status],
      )}
    >
      {isStart ? (
        <Handle type="source" position={Position.Bottom} className="!bg-zinc-500" />
      ) : (
        <Handle type="target" position={Position.Top} className="!bg-zinc-500" />
      )}
      <span className={cn('text-xs font-semibold', isStart ? 'text-emerald-400' : 'text-zinc-400')}>
        {label}
      </span>
    </div>
  );
}
