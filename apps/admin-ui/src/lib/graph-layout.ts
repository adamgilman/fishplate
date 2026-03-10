import * as dagre from '@dagrejs/dagre';
import type { Node, Edge } from '@xyflow/react';
import type { WorkflowDefinition, NodeDefinition, EdgeDefinition } from '@fishplate/workflow-core';
import type { WorkflowExecutionView, ExecutionNodeState, ExecutionEdgeState } from '../types/execution-view';

export interface WorkflowNodeData {
  definition: NodeDefinition;
  executionState: ExecutionNodeState;
  isEntrypoint: boolean;
  edges: EdgeDefinition[];
  edgeStates: ExecutionEdgeState[];
}

export interface WorkflowEdgeData {
  taken: boolean;
  when?: string;
  priority?: number;
  isBackEdge?: boolean;
}

const NODE_WIDTH = 220;
const NODE_HEIGHT = 80;

export function layoutWorkflowGraph(
  definition: WorkflowDefinition,
  execution: WorkflowExecutionView,
): { nodes: Node<WorkflowNodeData>[]; edges: Edge<WorkflowEdgeData>[] } {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'TB', nodesep: 60, ranksep: 80 });

  const nodeStateMap = new Map(execution.nodeStates.map(ns => [ns.nodeId, ns]));

  for (const node of definition.nodes) {
    g.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  }

  for (const edge of definition.edges) {
    g.setEdge(edge.from, edge.to);
  }

  dagre.layout(g);

  const nodes: Node<WorkflowNodeData>[] = definition.nodes.map(node => {
    const pos = g.node(node.id);
    const outgoingEdges = definition.edges.filter(e => e.from === node.id);
    const outgoingEdgeStates = execution.edgeStates.filter(e => e.from === node.id);

    return {
      id: node.id,
      type: node.type,
      position: { x: pos.x - NODE_WIDTH / 2, y: pos.y - NODE_HEIGHT / 2 },
      data: {
        definition: node,
        executionState: nodeStateMap.get(node.id) ?? { nodeId: node.id, status: 'pending' as const },
        isEntrypoint: node.id === definition.entrypoint,
        edges: outgoingEdges,
        edgeStates: outgoingEdgeStates,
      },
    };
  });

  const edgeStateMap = new Map(
    execution.edgeStates.map(es => [`${es.from}->${es.to}:${es.when ?? ''}:${es.priority ?? ''}`, es])
  );

  // Build position lookup for back-edge detection
  const nodePositionMap = new Map(nodes.map(n => [n.id, n.position]));

  const edges: Edge<WorkflowEdgeData>[] = definition.edges.map((edge, i) => {
    const key = `${edge.from}->${edge.to}:${edge.when ?? ''}:${edge.priority ?? ''}`;
    const edgeState = edgeStateMap.get(key);

    const sourcePos = nodePositionMap.get(edge.from);
    const targetPos = nodePositionMap.get(edge.to);
    const isBackEdge = sourcePos && targetPos && targetPos.y <= sourcePos.y;

    return {
      id: `e-${edge.from}-${edge.to}-${i}`,
      source: edge.from,
      target: edge.to,
      type: isBackEdge ? 'back' : undefined,
      sourceHandle: isBackEdge ? 'back-source' : undefined,
      targetHandle: isBackEdge ? 'back-target' : undefined,
      data: {
        taken: edgeState?.taken ?? false,
        when: edge.when,
        priority: edge.priority,
        isBackEdge: !!isBackEdge,
      },
    };
  });

  return { nodes, edges };
}
