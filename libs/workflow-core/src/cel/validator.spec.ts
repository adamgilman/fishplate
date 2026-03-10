import { describe, it, expect } from 'vitest';
import { validateCelExpressions } from './validator';
import type { WorkflowGraph } from '../models';

describe('validateCelExpressions', () => {
  it('accepts graph with valid CEL expressions', () => {
    const graph: WorkflowGraph = {
      entrypoint: 'a',
      nodes: [
        { id: 'a', type: 'action', handler: 'h', input: '{"x": ctx.x}' },
        { id: 'd', type: 'decision' },
        { id: 'e', type: 'terminal' },
      ],
      edges: [
        { from: 'a', to: 'd' },
        { from: 'd', to: 'e', when: 'ctx.x > 1' },
      ],
    };
    const result = validateCelExpressions(graph);
    expect(result.valid).toBe(true);
  });

  it('rejects invalid CEL in node input', () => {
    const graph: WorkflowGraph = {
      entrypoint: 'a',
      nodes: [
        { id: 'a', type: 'action', handler: 'h', input: 'invalid..expr' },
        { id: 'e', type: 'terminal' },
      ],
      edges: [{ from: 'a', to: 'e' }],
    };
    const result = validateCelExpressions(graph);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/node 'a'/);
  });

  it('rejects invalid CEL in edge when', () => {
    const graph: WorkflowGraph = {
      entrypoint: 'a',
      nodes: [
        { id: 'a', type: 'decision' },
        { id: 'b', type: 'terminal' },
      ],
      edges: [{ from: 'a', to: 'b', when: '>>> bad' }],
    };
    const result = validateCelExpressions(graph);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/edge.*a.*b/i);
  });

  it('accepts graph with no CEL expressions', () => {
    const graph: WorkflowGraph = {
      entrypoint: 'a',
      nodes: [
        { id: 'a', type: 'action', handler: 'h' },
        { id: 'b', type: 'terminal' },
      ],
      edges: [{ from: 'a', to: 'b' }],
    };
    const result = validateCelExpressions(graph);
    expect(result.valid).toBe(true);
  });
});
