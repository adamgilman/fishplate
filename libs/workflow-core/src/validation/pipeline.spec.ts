import { describe, it, expect } from 'vitest';
import { validateWorkflowGraph } from './pipeline';
import type { WorkflowGraph } from '../models';

describe('validateWorkflowGraph', () => {
  it('passes a fully valid graph', () => {
    const graph: WorkflowGraph = {
      entrypoint: 'a',
      nodes: [
        { id: 'a', type: 'action', handler: 'h', input: '{"x": ctx.x}' },
        { id: 'd', type: 'decision' },
        { id: 'y', type: 'terminal' },
        { id: 'n', type: 'terminal' },
      ],
      edges: [
        { from: 'a', to: 'd' },
        { from: 'd', to: 'y', when: 'ctx.x > 0', priority: 0 },
        { from: 'd', to: 'n', priority: 1 },
      ],
    };
    const result = validateWorkflowGraph(graph);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('collects errors from all validation layers', () => {
    const graph: WorkflowGraph = {
      entrypoint: '',
      nodes: [],
      edges: [],
    };
    const result = validateWorkflowGraph(graph);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('stops early if schema validation fails', () => {
    const graph: WorkflowGraph = {
      entrypoint: 'a',
      nodes: [
        { id: 'a', type: 'action' }, // missing handler
        { id: 'b', type: 'terminal' },
      ],
      edges: [{ from: 'a', to: 'b' }],
    };
    const result = validateWorkflowGraph(graph);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/handler/i);
  });
});
