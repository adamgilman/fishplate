import { describe, it, expect } from 'vitest';
import { isNodeType } from './definition';

describe('isNodeType', () => {
  it('returns true for valid node types', () => {
    expect(isNodeType('action')).toBe(true);
    expect(isNodeType('decision')).toBe(true);
    expect(isNodeType('fork')).toBe(true);
    expect(isNodeType('gate')).toBe(true);
    expect(isNodeType('terminal')).toBe(true);
    expect(isNodeType('workflow')).toBe(true);
  });

  it('returns false for invalid node types', () => {
    expect(isNodeType('invalid')).toBe(false);
    expect(isNodeType('')).toBe(false);
  });
});
