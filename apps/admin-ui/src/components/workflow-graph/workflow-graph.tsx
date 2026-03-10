import { useMemo, useCallback } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  type NodeTypes,
  type EdgeTypes,
  type OnSelectionChangeParams,
  MarkerType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { WorkflowDefinition } from '@fishplate/workflow-core';
import type { WorkflowExecutionView } from '@/types/execution-view';
import { layoutWorkflowGraph } from '@/lib/graph-layout';
import { ActionNode, DecisionNode, ForkNode, GateNode, TerminalNode, WorkflowNode } from './nodes';
import { DagreEdge } from './edges/dagre-edge';

const nodeTypes: NodeTypes = {
  action: ActionNode,
  decision: DecisionNode,
  fork: ForkNode,
  gate: GateNode,
  terminal: TerminalNode,
  workflow: WorkflowNode,
};

const edgeTypes: EdgeTypes = {
  dagre: DagreEdge,
};

interface WorkflowGraphProps {
  definition: WorkflowDefinition;
  execution: WorkflowExecutionView;
  onNodeSelect?: (nodeId: string | null) => void;
}

export function WorkflowGraph({ definition, execution, onNodeSelect }: WorkflowGraphProps) {
  const { nodes, edges } = useMemo(
    () => layoutWorkflowGraph(definition, execution),
    [definition, execution],
  );

  const styledEdges = useMemo(
    () =>
      edges.map(edge => ({
        ...edge,
        animated: edge.data?.taken,
        style: {
          stroke: edge.data?.taken ? '#3b82f6' : '#3f3f46',
          strokeWidth: edge.data?.taken ? 2 : 1,
          strokeDasharray: edge.data?.taken ? undefined : '5 5',
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: edge.data?.taken ? '#3b82f6' : '#3f3f46',
        },
        label: edge.data?.when
          ? edge.data.when.length > 30
            ? edge.data.when.substring(0, 30) + '...'
            : edge.data.when
          : undefined,
        labelStyle: { fill: '#71717a', fontSize: 10 },
        labelBgStyle: { fill: '#09090b', fillOpacity: 0.8 },
      })),
    [edges],
  );

  const handleSelectionChange = useCallback(
    ({ nodes: selectedNodes }: OnSelectionChangeParams) => {
      if (selectedNodes.length > 0) {
        onNodeSelect?.(selectedNodes[0].id);
      } else {
        onNodeSelect?.(null);
      }
    },
    [onNodeSelect],
  );

  return (
    <div className="w-full h-full">
      <ReactFlow
        nodes={nodes}
        edges={styledEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onSelectionChange={handleSelectionChange}
        fitView
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#27272a" gap={20} />
        <Controls className="!bg-zinc-800 !border-zinc-700 [&>button]:!bg-zinc-800 [&>button]:!border-zinc-700 [&>button]:!text-zinc-400" />
      </ReactFlow>
    </div>
  );
}
