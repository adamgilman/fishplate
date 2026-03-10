import { describe, it, expect } from 'vitest';
import { validateSchema } from './schema';
import type { WorkflowGraph } from '../models';

const validGraph: WorkflowGraph = {
  entrypoint: 'start',
  nodes: [
    { id: 'start', type: 'action', handler: 'do_thing' },
    { id: 'end', type: 'terminal' },
  ],
  edges: [{ from: 'start', to: 'end' }],
};

describe('validateSchema', () => {
  it('accepts a valid graph', () => {
    const result = validateSchema(validGraph);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('rejects missing entrypoint', () => {
    const graph = { ...validGraph, entrypoint: '' };
    const result = validateSchema(graph);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/entrypoint/i);
  });

  it('rejects action node without handler', () => {
    const graph: WorkflowGraph = {
      entrypoint: 'start',
      nodes: [
        { id: 'start', type: 'action' },
        { id: 'end', type: 'terminal' },
      ],
      edges: [{ from: 'start', to: 'end' }],
    };
    const result = validateSchema(graph);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/handler/i);
  });

  it('rejects workflow node without workflowRef', () => {
    const graph: WorkflowGraph = {
      entrypoint: 'start',
      nodes: [
        { id: 'start', type: 'workflow' },
        { id: 'end', type: 'terminal' },
      ],
      edges: [{ from: 'start', to: 'end' }],
    };
    const result = validateSchema(graph);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/workflowRef/i);
  });

  it('rejects fork node without branches', () => {
    const graph: WorkflowGraph = {
      entrypoint: 'start',
      nodes: [
        { id: 'start', type: 'fork', joinNode: 'join' },
        { id: 'join', type: 'terminal' },
      ],
      edges: [],
    };
    const result = validateSchema(graph);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/branches/i);
  });

  it('rejects fork node without joinNode', () => {
    const graph: WorkflowGraph = {
      entrypoint: 'start',
      nodes: [
        { id: 'start', type: 'fork', branches: ['a'] },
        { id: 'a', type: 'terminal' },
      ],
      edges: [],
    };
    const result = validateSchema(graph);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/joinNode/i);
  });

  it('rejects empty nodes array', () => {
    const graph: WorkflowGraph = { entrypoint: 'x', nodes: [], edges: [] };
    const result = validateSchema(graph);
    expect(result.valid).toBe(false);
  });

  it('rejects duplicate node IDs', () => {
    const graph: WorkflowGraph = {
      entrypoint: 'a',
      nodes: [
        { id: 'a', type: 'action', handler: 'h' },
        { id: 'a', type: 'terminal' },
      ],
      edges: [],
    };
    const result = validateSchema(graph);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/duplicate/i);
  });
});
