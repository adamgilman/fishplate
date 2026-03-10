import { describe, it, expect } from 'vitest';
import { validateGraph } from './validator';
import type { WorkflowGraph } from '../models';

describe('validateGraph', () => {
  it('accepts a valid linear graph', () => {
    const graph: WorkflowGraph = {
      entrypoint: 'a',
      nodes: [
        { id: 'a', type: 'action', handler: 'h' },
        { id: 'b', type: 'terminal' },
      ],
      edges: [{ from: 'a', to: 'b' }],
    };
    const result = validateGraph(graph);
    expect(result.valid).toBe(true);
  });

  it('rejects when entrypoint node does not exist', () => {
    const graph: WorkflowGraph = {
      entrypoint: 'missing',
      nodes: [{ id: 'a', type: 'terminal' }],
      edges: [],
    };
    const result = validateGraph(graph);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/entrypoint/i);
  });

  it('rejects orphan nodes', () => {
    const graph: WorkflowGraph = {
      entrypoint: 'a',
      nodes: [
        { id: 'a', type: 'terminal' },
        { id: 'orphan', type: 'action', handler: 'h' },
      ],
      edges: [],
    };
    const result = validateGraph(graph);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/orphan|unreachable/i);
  });

  it('rejects dangling edges', () => {
    const graph: WorkflowGraph = {
      entrypoint: 'a',
      nodes: [{ id: 'a', type: 'action', handler: 'h' }],
      edges: [{ from: 'a', to: 'missing' }],
    };
    const result = validateGraph(graph);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/dangling|missing/i);
  });

  it('rejects terminal nodes with outgoing edges', () => {
    const graph: WorkflowGraph = {
      entrypoint: 'a',
      nodes: [
        { id: 'a', type: 'terminal' },
        { id: 'b', type: 'terminal' },
      ],
      edges: [{ from: 'a', to: 'b' }],
    };
    const result = validateGraph(graph);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/terminal/i);
  });

  it('rejects action nodes with zero outgoing edges', () => {
    const graph: WorkflowGraph = {
      entrypoint: 'a',
      nodes: [{ id: 'a', type: 'action', handler: 'h' }],
      edges: [],
    };
    const result = validateGraph(graph);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/exactly one outgoing edge/i);
  });

  it('rejects action nodes with multiple outgoing edges', () => {
    const graph: WorkflowGraph = {
      entrypoint: 'a',
      nodes: [
        { id: 'a', type: 'action', handler: 'h' },
        { id: 'b', type: 'terminal' },
        { id: 'c', type: 'terminal' },
      ],
      edges: [
        { from: 'a', to: 'b' },
        { from: 'a', to: 'c' },
      ],
    };
    const result = validateGraph(graph);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/exactly one outgoing edge/i);
  });

  it('rejects decision nodes with zero outgoing edges', () => {
    const graph: WorkflowGraph = {
      entrypoint: 'a',
      nodes: [{ id: 'a', type: 'decision' }],
      edges: [],
    };
    const result = validateGraph(graph);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/at least one outgoing edge/i);
  });

  it('accepts decision nodes with multiple outgoing edges', () => {
    const graph: WorkflowGraph = {
      entrypoint: 'd',
      nodes: [
        { id: 'd', type: 'decision' },
        { id: 'a', type: 'terminal' },
        { id: 'b', type: 'terminal' },
      ],
      edges: [
        { from: 'd', to: 'a', when: 'ctx.x > 0' },
        { from: 'd', to: 'b' },
      ],
    };
    const result = validateGraph(graph);
    expect(result.valid).toBe(true);
  });

  it('rejects gate nodes with timeoutEdge pointing to missing node', () => {
    const graph: WorkflowGraph = {
      entrypoint: 'g',
      nodes: [
        { id: 'g', type: 'gate', timeoutEdge: 'missing' },
        { id: 'b', type: 'terminal' },
      ],
      edges: [{ from: 'g', to: 'b' }],
    };
    const result = validateGraph(graph);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/timeoutEdge/i);
  });

  it('rejects fork with non-existent branch entries', () => {
    const graph: WorkflowGraph = {
      entrypoint: 'f',
      nodes: [
        { id: 'f', type: 'fork', branches: ['missing'], joinNode: 'j' },
        { id: 'j', type: 'terminal' },
      ],
      edges: [],
    };
    const result = validateGraph(graph);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/branch/i);
  });

  it('rejects fork with duplicate branch entries', () => {
    const graph: WorkflowGraph = {
      entrypoint: 'f',
      nodes: [
        { id: 'f', type: 'fork', branches: ['a', 'a'], joinNode: 'j' },
        { id: 'a', type: 'action', handler: 'h' },
        { id: 'j', type: 'terminal' },
      ],
      edges: [{ from: 'a', to: 'j' }],
    };
    const result = validateGraph(graph);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/duplicate/i);
  });

  it('rejects fork with missing joinNode', () => {
    const graph: WorkflowGraph = {
      entrypoint: 'f',
      nodes: [
        { id: 'f', type: 'fork', branches: ['a'], joinNode: 'missing' },
        { id: 'a', type: 'action', handler: 'h' },
      ],
      edges: [{ from: 'a', to: 'missing' }],
    };
    const result = validateGraph(graph);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/joinNode/i);
  });

  it('rejects fork where joinNode is not reachable from a branch', () => {
    const graph: WorkflowGraph = {
      entrypoint: 'f',
      nodes: [
        { id: 'f', type: 'fork', branches: ['b1', 'b2'], joinNode: 'join' },
        { id: 'b1', type: 'action', handler: 'h1' },
        { id: 'b2', type: 'action', handler: 'h2' },
        { id: 'dead', type: 'terminal' },
        { id: 'join', type: 'terminal' },
      ],
      edges: [
        { from: 'b1', to: 'join' },
        { from: 'b2', to: 'dead' }, // b2 cannot reach join
      ],
    };
    const result = validateGraph(graph);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/reachable.*joinNode|joinNode.*reachable/i);
  });

  it('accepts valid graph with cycle (loop)', () => {
    const graph: WorkflowGraph = {
      entrypoint: 'gen',
      nodes: [
        { id: 'gen', type: 'action', handler: 'generate' },
        { id: 'test', type: 'action', handler: 'run_tests' },
        { id: 'check', type: 'decision' },
        { id: 'done', type: 'terminal' },
      ],
      edges: [
        { from: 'gen', to: 'test' },
        { from: 'test', to: 'check' },
        { from: 'check', to: 'done', when: 'ctx.pass', priority: 0 },
        { from: 'check', to: 'gen', when: '!ctx.pass', priority: 1 },
      ],
    };
    const result = validateGraph(graph);
    expect(result.valid).toBe(true);
  });
});
