import { describe, it, expect } from 'vitest';
import { LoopGuard } from './loop-guard';

describe('LoopGuard', () => {
  it('allows traversal under limit', () => {
    const guard = new LoopGuard(3);
    expect(guard.check('a', 'b')).toBe(true);
    expect(guard.check('a', 'b')).toBe(true);
    expect(guard.check('a', 'b')).toBe(true);
  });

  it('rejects traversal at limit', () => {
    const guard = new LoopGuard(2);
    guard.check('a', 'b');
    guard.check('a', 'b');
    expect(guard.check('a', 'b')).toBe(false);
  });

  it('uses per-edge override when provided', () => {
    const guard = new LoopGuard(100);
    guard.check('a', 'b', 1);
    expect(guard.check('a', 'b', 1)).toBe(false);
  });

  it('tracks edges independently', () => {
    const guard = new LoopGuard(2);
    guard.check('a', 'b');
    guard.check('a', 'b');
    expect(guard.check('a', 'b')).toBe(false);
    expect(guard.check('c', 'd')).toBe(true);
  });

  it('exposes loop map for CEL context', () => {
    const guard = new LoopGuard(10);
    guard.check('a', 'b');
    guard.check('a', 'b');
    const map = guard.getLoopMap();
    expect(map['a->b']).toBe(2);
    expect(map['x->y']).toBeUndefined();
  });
});
