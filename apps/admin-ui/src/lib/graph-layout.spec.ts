import { describe, it, expect } from 'vitest';
import { layoutWorkflowGraph } from './graph-layout';
import type { WorkflowDefinition } from '@fishplate/workflow-core';
import type { WorkflowExecutionView, ExecutionNodeState, ExecutionEdgeState } from '../types/execution-view';

const definition: WorkflowDefinition = {
  id: 'def-1',
  tenantId: 't1',
  name: 'test',
  version: 1,
  isTemplate: false,
  createdAt: new Date(),
  entrypoint: 'a',
  nodes: [
    { id: 'a', type: 'action', handler: 'h1' },
    { id: 'b', type: 'decision' },
    { id: 'c', type: 'terminal' },
  ],
  edges: [
    { from: 'a', to: 'b' },
    { from: 'b', to: 'c', when: 'ctx.x > 0' },
  ],
};

const execution: WorkflowExecutionView = {
  executionId: 'e1',
  definitionId: 'def-1',
  status: 'running',
  currentNodeId: 'b',
  context: {},
  params: {},
  nodeStates: [
    { nodeId: 'a', status: 'completed' },
    { nodeId: 'b', status: 'running' },
    { nodeId: 'c', status: 'pending' },
  ],
  edgeStates: [
    { from: 'a', to: 'b', taken: true },
    { from: 'b', to: 'c', when: 'ctx.x > 0', taken: false },
  ],
};

describe('layoutWorkflowGraph', () => {
  it('returns nodes with positions for every definition node', () => {
    const result = layoutWorkflowGraph(definition, execution);
    expect(result.nodes).toHaveLength(3);
    for (const node of result.nodes) {
      expect(node.position).toBeDefined();
      expect(typeof node.position.x).toBe('number');
      expect(typeof node.position.y).toBe('number');
    }
  });

  it('assigns correct node types', () => {
    const result = layoutWorkflowGraph(definition, execution);
    const nodeMap = new Map(result.nodes.map(n => [n.id, n]));
    expect(nodeMap.get('a')!.type).toBe('action');
    expect(nodeMap.get('b')!.type).toBe('decision');
    expect(nodeMap.get('c')!.type).toBe('terminal');
  });

  it('passes node data including definition and execution state', () => {
    const result = layoutWorkflowGraph(definition, execution);
    const nodeA = result.nodes.find(n => n.id === 'a')!;
    expect(nodeA.data.definition).toBeDefined();
    expect(nodeA.data.definition.handler).toBe('h1');
    expect(nodeA.data.executionState).toBeDefined();
    expect(nodeA.data.executionState.status).toBe('completed');
    expect(nodeA.data.isEntrypoint).toBe(true);
  });

  it('returns edges for every definition edge', () => {
    const result = layoutWorkflowGraph(definition, execution);
    expect(result.edges).toHaveLength(2);
  });

  it('marks taken edges with animated style', () => {
    const result = layoutWorkflowGraph(definition, execution);
    const takenEdge = result.edges.find(e => e.source === 'a' && e.target === 'b')!;
    const untakenEdge = result.edges.find(e => e.source === 'b' && e.target === 'c')!;
    expect(takenEdge.data.taken).toBe(true);
    expect(untakenEdge.data.taken).toBe(false);
  });

  it('includes dagre waypoints on every edge', () => {
    const result = layoutWorkflowGraph(definition, execution);
    for (const edge of result.edges) {
      expect(edge.data.points).toBeDefined();
      expect(edge.data.points.length).toBeGreaterThanOrEqual(2);
      for (const pt of edge.data.points) {
        expect(typeof pt.x).toBe('number');
        expect(typeof pt.y).toBe('number');
      }
    }
  });

  it('uses dagre edge type for all edges', () => {
    const result = layoutWorkflowGraph(definition, execution);
    for (const edge of result.edges) {
      expect(edge.type).toBe('dagre');
    }
  });
});
