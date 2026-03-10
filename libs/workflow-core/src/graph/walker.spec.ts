import { describe, it, expect } from 'vitest';
import { GraphWalker } from './walker';
import type { WorkflowDefinition } from '../models';

function makeDef(overrides: Partial<WorkflowDefinition> & Pick<WorkflowDefinition, 'entrypoint' | 'nodes' | 'edges'>): WorkflowDefinition {
  return {
    id: 'def-1',
    tenantId: 'tenant-1',
    name: 'test',
    version: 1,
    isTemplate: false,
    createdAt: new Date(),
    ...overrides,
  };
}

describe('GraphWalker', () => {
  describe('linear traversal', () => {
    it('walks a simple action -> terminal graph', () => {
      const def = makeDef({
        entrypoint: 'a',
        nodes: [
          { id: 'a', type: 'action', handler: 'do_thing', input: '{"x": ctx.x}' },
          { id: 'b', type: 'terminal' },
        ],
        edges: [{ from: 'a', to: 'b' }],
      });

      const walker = new GraphWalker(def, { x: 42 });
      const cmd = walker.next();
      expect(cmd.type).toBe('execute_action');
      if (cmd.type === 'execute_action') {
        expect(cmd.handler).toBe('do_thing');
        expect(cmd.input).toEqual({ x: 42 });
      }

      walker.resolve({ contextUpdates: { result: 'ok' } });
      const cmd2 = walker.next();
      expect(cmd2.type).toBe('complete');
      if (cmd2.type === 'complete') {
        expect(cmd2.context).toEqual({ x: 42, result: 'ok' });
      }
    });

    it('action node without input CEL passes empty input', () => {
      const def = makeDef({
        entrypoint: 'a',
        nodes: [
          { id: 'a', type: 'action', handler: 'h' },
          { id: 'b', type: 'terminal' },
        ],
        edges: [{ from: 'a', to: 'b' }],
      });

      const walker = new GraphWalker(def, {});
      const cmd = walker.next();
      expect(cmd.type).toBe('execute_action');
      if (cmd.type === 'execute_action') {
        expect(cmd.input).toEqual({});
      }
    });
  });

  describe('decision traversal', () => {
    it('follows the matching edge', () => {
      const def = makeDef({
        entrypoint: 'd',
        nodes: [
          { id: 'd', type: 'decision' },
          { id: 'yes', type: 'terminal' },
          { id: 'no', type: 'terminal' },
        ],
        edges: [
          { from: 'd', to: 'yes', when: 'ctx.score > 0.5', priority: 0 },
          { from: 'd', to: 'no', priority: 1 },
        ],
      });

      const walker = new GraphWalker(def, { score: 0.8 });
      const cmd = walker.next();
      expect(cmd.type).toBe('complete');
      if (cmd.type === 'complete') {
        expect(cmd.context).toEqual({ score: 0.8 });
      }
    });

    it('follows fallback edge when no condition matches', () => {
      const def = makeDef({
        entrypoint: 'd',
        nodes: [
          { id: 'd', type: 'decision' },
          { id: 'yes', type: 'terminal' },
          { id: 'no', type: 'terminal' },
        ],
        edges: [
          { from: 'd', to: 'yes', when: 'ctx.score > 0.5', priority: 0 },
          { from: 'd', to: 'no', priority: 1 },
        ],
      });

      const walker = new GraphWalker(def, { score: 0.1 });
      const cmd = walker.next();
      expect(cmd.type).toBe('complete');
    });

    it('emits fail when no edges match (all have conditions)', () => {
      const def = makeDef({
        entrypoint: 'd',
        nodes: [
          { id: 'd', type: 'decision' },
          { id: 'a', type: 'terminal' },
        ],
        edges: [
          { from: 'd', to: 'a', when: 'ctx.x > 100' },
        ],
      });

      const walker = new GraphWalker(def, { x: 1 });
      const cmd = walker.next();
      expect(cmd.type).toBe('fail');
    });
  });

  describe('error propagation', () => {
    it('emits fail after resolve with error', () => {
      const def = makeDef({
        entrypoint: 'a',
        nodes: [
          { id: 'a', type: 'action', handler: 'h' },
          { id: 'b', type: 'terminal' },
        ],
        edges: [{ from: 'a', to: 'b' }],
      });

      const walker = new GraphWalker(def, {});
      walker.next(); // execute_action
      walker.resolve({ error: 'something broke' });
      const cmd = walker.next();
      expect(cmd.type).toBe('fail');
      if (cmd.type === 'fail') {
        expect(cmd.reason).toBe('something broke');
      }
    });
  });

  describe('getContext', () => {
    it('returns accumulated context', () => {
      const def = makeDef({
        entrypoint: 'a',
        nodes: [
          { id: 'a', type: 'action', handler: 'h' },
          { id: 'b', type: 'terminal' },
        ],
        edges: [{ from: 'a', to: 'b' }],
      });

      const walker = new GraphWalker(def, { initial: true });
      walker.next();
      walker.resolve({ contextUpdates: { added: 'value' } });
      expect(walker.getContext()).toEqual({ initial: true, added: 'value' });
    });
  });
});
