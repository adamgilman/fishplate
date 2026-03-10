import { evaluate, parse } from '@marcbachmann/cel-js';

export interface CelContext {
  ctx: Record<string, any>;
  _loop: Record<string, number>;
}

export class CelEvaluator {
  evaluateCondition(expression: string, context: CelContext): boolean {
    const result = evaluate(expression, context);
    if (typeof result !== 'boolean') {
      throw new Error(
        `CEL condition '${expression}' returned ${typeof result}, expected boolean`
      );
    }
    return result;
  }

  evaluateInput(expression: string, context: CelContext): Record<string, any> {
    const result = evaluate(expression, context);
    if (typeof result !== 'object' || result === null || Array.isArray(result)) {
      throw new Error(
        `CEL input '${expression}' returned ${typeof result}, expected object`
      );
    }
    return result as Record<string, any>;
  }

  validate(expression: string): boolean {
    try {
      parse(expression);
      return true;
    } catch {
      return false;
    }
  }
}
