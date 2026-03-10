import { Handle, Position } from '@xyflow/react';
import { cn } from '@/lib/utils';
import type { WorkflowNodeData } from '@/lib/graph-layout';

const statusStyles: Record<string, string> = {
  completed: 'border-emerald-500 bg-emerald-500/10',
  running: 'border-blue-500 bg-blue-500/10 animate-pulse',
  failed: 'border-red-500 bg-red-500/10',
  waiting: 'border-amber-500 bg-amber-500/10 animate-pulse',
  pending: 'border-zinc-700 bg-zinc-800/50 opacity-50',
};

interface BaseNodeProps {
  data: WorkflowNodeData;
  children: React.ReactNode;
  className?: string;
  shape?: 'rounded' | 'diamond' | 'circle';
}

export function BaseNode({ data, children, className, shape = 'rounded' }: BaseNodeProps) {
  const status = data.executionState.status;
  const shapeClass = {
    rounded: 'rounded-lg',
    diamond: 'rounded-lg',
    circle: 'rounded-full',
  }[shape];

  return (
    <div
      className={cn(
        'border-2 px-4 py-3 min-w-[200px] text-center',
        shapeClass,
        statusStyles[status],
        className,
      )}
    >
      <Handle type="target" position={Position.Top} className="!bg-zinc-500" />
      <Handle type="target" position={Position.Right} id="back-target" className="!bg-zinc-500" />
      {children}
      <Handle type="source" position={Position.Bottom} className="!bg-zinc-500" />
      <Handle type="source" position={Position.Right} id="back-source" className="!bg-zinc-500" />
    </div>
  );
}
