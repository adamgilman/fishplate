package cel

import (
	"fmt"

	"github.com/google/cel-go/cel"
	"github.com/google/cel-go/common/types"
	"github.com/google/cel-go/common/types/ref"
	"github.com/google/cel-go/common/types/traits"
)

// Evaluator wraps cel-go to evaluate CEL expressions against workflow context.
type Evaluator struct{}

// NewEvaluator creates a new CEL evaluator.
func NewEvaluator() *Evaluator {
	return &Evaluator{}
}

func newEnv() (*cel.Env, error) {
	return cel.NewEnv(
		cel.Variable("ctx", cel.MapType(cel.StringType, cel.DynType)),
		cel.Variable("_loop", cel.MapType(cel.StringType, cel.IntType)),
	)
}

func buildVars(ctx map[string]any, loops map[string]int64) map[string]any {
	if ctx == nil {
		ctx = map[string]any{}
	}
	if loops == nil {
		loops = map[string]int64{}
	}
	return map[string]any{
		"ctx":   ctx,
		"_loop": loops,
	}
}

// EvaluateCondition compiles and evaluates a CEL expression that must return a bool.
func (e *Evaluator) EvaluateCondition(expression string, ctx map[string]any, loops map[string]int64) (bool, error) {
	env, err := newEnv()
	if err != nil {
		return false, fmt.Errorf("cel env: %w", err)
	}

	ast, issues := env.Compile(expression)
	if issues != nil && issues.Err() != nil {
		return false, fmt.Errorf("cel compile: %w", issues.Err())
	}

	prg, err := env.Program(ast)
	if err != nil {
		return false, fmt.Errorf("cel program: %w", err)
	}

	out, _, err := prg.Eval(buildVars(ctx, loops))
	if err != nil {
		return false, fmt.Errorf("cel eval: %w", err)
	}

	b, ok := out.Value().(bool)
	if !ok {
		return false, fmt.Errorf("cel result: expected bool, got %T", out.Value())
	}
	return b, nil
}

// EvaluateInput compiles and evaluates a CEL expression that must return a map.
func (e *Evaluator) EvaluateInput(expression string, ctx map[string]any, loops map[string]int64) (map[string]any, error) {
	env, err := newEnv()
	if err != nil {
		return nil, fmt.Errorf("cel env: %w", err)
	}

	ast, issues := env.Compile(expression)
	if issues != nil && issues.Err() != nil {
		return nil, fmt.Errorf("cel compile: %w", issues.Err())
	}

	prg, err := env.Program(ast)
	if err != nil {
		return nil, fmt.Errorf("cel program: %w", err)
	}

	out, _, err := prg.Eval(buildVars(ctx, loops))
	if err != nil {
		return nil, fmt.Errorf("cel eval: %w", err)
	}

	return celValToGoMap(out)
}

func celValToGoMap(val ref.Val) (map[string]any, error) {
	// Try native Go map first
	if m, ok := val.Value().(map[string]any); ok {
		return m, nil
	}

	// Handle CEL ref.Val map
	if m, ok := val.Value().(map[ref.Val]ref.Val); ok {
		result := make(map[string]any, len(m))
		for k, v := range m {
			ks, ok := k.Value().(string)
			if !ok {
				return nil, fmt.Errorf("cel map key: expected string, got %T", k.Value())
			}
			result[ks] = v.Value()
		}
		return result, nil
	}

	// Try converting via the mapper/iterator traits
	if mapper, ok := val.(traits.Mapper); ok {
		it := mapper.Iterator()
		result := make(map[string]any)
		for it.HasNext() == types.True {
			k := it.Next()
			v := mapper.Get(k)
			ks, ok := k.Value().(string)
			if !ok {
				return nil, fmt.Errorf("cel map key: expected string, got %T", k.Value())
			}
			result[ks] = v.Value()
		}
		return result, nil
	}

	return nil, fmt.Errorf("cel result: expected map, got %T", val.Value())
}
