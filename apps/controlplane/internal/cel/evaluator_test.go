package cel_test

import (
	"testing"

	"github.com/adamgilman/fishplate/apps/controlplane/internal/cel"
)

func TestEvaluateCondition_True(t *testing.T) {
	e := cel.NewEvaluator()
	ctx := map[string]any{"tests_passing": true, "coverage": 85}
	result, err := e.EvaluateCondition("ctx.tests_passing == true && ctx.coverage > 80", ctx, nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !result {
		t.Fatal("expected true")
	}
}

func TestEvaluateCondition_False(t *testing.T) {
	e := cel.NewEvaluator()
	ctx := map[string]any{"tests_passing": true, "coverage": 65}
	result, err := e.EvaluateCondition("ctx.tests_passing == true && ctx.coverage > 80", ctx, nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result {
		t.Fatal("expected false")
	}
}

func TestEvaluateCondition_WithLoopVar(t *testing.T) {
	e := cel.NewEvaluator()
	ctx := map[string]any{"x": 1}
	loops := map[string]int64{"review->generate": 3}
	result, err := e.EvaluateCondition(`_loop["review->generate"] < 5`, ctx, loops)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !result {
		t.Fatal("expected true")
	}
}

func TestEvaluateInput(t *testing.T) {
	e := cel.NewEvaluator()
	ctx := map[string]any{"task": "build API", "model": "claude-sonnet-4-6"}
	result, err := e.EvaluateInput(`{"task": ctx.task, "model": ctx.model}`, ctx, nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result["task"] != "build API" {
		t.Fatalf("expected task='build API', got %v", result["task"])
	}
	if result["model"] != "claude-sonnet-4-6" {
		t.Fatalf("expected model='claude-sonnet-4-6', got %v", result["model"])
	}
}

func TestEvaluateCondition_InvalidExpression(t *testing.T) {
	e := cel.NewEvaluator()
	_, err := e.EvaluateCondition("invalid $$$ expr", nil, nil)
	if err == nil {
		t.Fatal("expected error for invalid expression")
	}
}
