import { describe, it, expect } from 'vitest';
import { CelEvaluator } from './evaluator';

describe('CelEvaluator', () => {
  const evaluator = new CelEvaluator();

  describe('evaluateCondition', () => {
    it('evaluates a true condition', () => {
      const result = evaluator.evaluateCondition('ctx.score > 0.5', {
        ctx: { score: 0.8 },
        _loop: {},
      });
      expect(result).toBe(true);
    });

    it('evaluates a false condition', () => {
      const result = evaluator.evaluateCondition('ctx.score > 0.5', {
        ctx: { score: 0.3 },
        _loop: {},
      });
      expect(result).toBe(false);
    });

    it('supports _loop variables', () => {
      const result = evaluator.evaluateCondition(
        '_loop["review->generate"] < 3',
        { ctx: {}, _loop: { 'review->generate': 2 } }
      );
      expect(result).toBe(true);
    });

    it('returns fail result for non-boolean return', () => {
      expect(() =>
        evaluator.evaluateCondition('ctx.name', {
          ctx: { name: 'hello' },
          _loop: {},
        })
      ).toThrow(/expected boolean/i);
    });

    it('throws on CEL evaluation error', () => {
      expect(() =>
        evaluator.evaluateCondition('invalid..syntax', {
          ctx: {},
          _loop: {},
        })
      ).toThrow();
    });
  });

  describe('evaluateInput', () => {
    it('evaluates a CEL expression to an object', () => {
      const result = evaluator.evaluateInput('{"code": ctx.code, "lang": ctx.lang}', {
        ctx: { code: 'hello()', lang: 'python' },
        _loop: {},
      });
      expect(result).toEqual({ code: 'hello()', lang: 'python' });
    });

    it('throws for non-object return', () => {
      expect(() =>
        evaluator.evaluateInput('"just a string"', {
          ctx: {},
          _loop: {},
        })
      ).toThrow(/expected object/i);
    });
  });

  describe('validate', () => {
    it('returns true for valid CEL expression', () => {
      expect(evaluator.validate('ctx.x > 1')).toBe(true);
    });

    it('returns false for invalid CEL syntax', () => {
      expect(evaluator.validate('ctx..x >')).toBe(false);
    });
  });
});
