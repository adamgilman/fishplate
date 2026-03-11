package graph_test

import (
	"testing"

	"github.com/adamgilman/fishplate/apps/controlplane/internal/graph"
	"github.com/adamgilman/fishplate/apps/controlplane/internal/model"
)

func linearDef() *model.WorkflowDefinition {
	return &model.WorkflowDefinition{
		Entrypoint: "start", MaxIterations: 100,
		Nodes: []model.NodeDefinition{
			{ID: "start", Type: model.NodeTypeTerminal},
			{ID: "do_thing", Type: model.NodeTypeAction, Handler: "my_handler"},
			{ID: "end", Type: model.NodeTypeTerminal},
		},
		Edges: []model.EdgeDefinition{
			{From: "start", To: "do_thing"},
			{From: "do_thing", To: "end"},
		},
	}
}

func decisionDef() *model.WorkflowDefinition {
	return &model.WorkflowDefinition{
		Entrypoint: "start", MaxIterations: 100,
		Nodes: []model.NodeDefinition{
			{ID: "start", Type: model.NodeTypeTerminal},
			{ID: "check", Type: model.NodeTypeDecision},
			{ID: "yes_action", Type: model.NodeTypeAction, Handler: "yes_handler"},
			{ID: "no_action", Type: model.NodeTypeAction, Handler: "no_handler"},
			{ID: "end", Type: model.NodeTypeTerminal},
		},
		Edges: []model.EdgeDefinition{
			{From: "start", To: "check"},
			{From: "check", To: "yes_action", When: "ctx.flag == true", Priority: 0},
			{From: "check", To: "no_action", Priority: 1}, // default fallback
			{From: "yes_action", To: "end"},
			{From: "no_action", To: "end"},
		},
	}
}

func TestWalker_LinearWorkflow(t *testing.T) {
	w := graph.NewWalker(linearDef(), map[string]any{})
	cmd := w.Next()
	if cmd.Type != graph.CmdExecuteAction {
		t.Fatalf("expected execute_action, got %s", cmd.Type)
	}
	if cmd.Handler != "my_handler" {
		t.Fatalf("expected my_handler, got %s", cmd.Handler)
	}
	w.Resolve(graph.CommandResult{ContextUpdates: map[string]any{"result": 42}})
	cmd = w.Next()
	if cmd.Type != graph.CmdComplete {
		t.Fatalf("expected complete, got %s", cmd.Type)
	}
	if cmd.Context["result"] != 42 {
		t.Fatal("expected result=42 in context")
	}
}

func TestWalker_DecisionTrue(t *testing.T) {
	w := graph.NewWalker(decisionDef(), map[string]any{"flag": true})
	cmd := w.Next()
	if cmd.Type != graph.CmdExecuteAction {
		t.Fatalf("expected execute_action, got %s", cmd.Type)
	}
	if cmd.Handler != "yes_handler" {
		t.Fatalf("expected yes_handler, got %s", cmd.Handler)
	}
}

func TestWalker_DecisionFalse(t *testing.T) {
	w := graph.NewWalker(decisionDef(), map[string]any{"flag": false})
	cmd := w.Next()
	if cmd.Type != graph.CmdExecuteAction {
		t.Fatalf("expected execute_action, got %s", cmd.Type)
	}
	if cmd.Handler != "no_handler" {
		t.Fatalf("expected no_handler, got %s", cmd.Handler)
	}
}

func TestWalker_ResolveError(t *testing.T) {
	w := graph.NewWalker(linearDef(), map[string]any{})
	w.Next()
	w.Resolve(graph.CommandResult{Error: "handler crashed"})
	cmd := w.Next()
	if cmd.Type != graph.CmdFail {
		t.Fatalf("expected fail, got %s", cmd.Type)
	}
	if cmd.Reason != "handler crashed" {
		t.Fatalf("expected 'handler crashed', got %s", cmd.Reason)
	}
}

func TestWalker_MissingNode(t *testing.T) {
	def := &model.WorkflowDefinition{Entrypoint: "nonexistent", MaxIterations: 100}
	w := graph.NewWalker(def, map[string]any{})
	cmd := w.Next()
	if cmd.Type != graph.CmdFail {
		t.Fatalf("expected fail, got %s", cmd.Type)
	}
}

func TestWalker_CELInput(t *testing.T) {
	def := &model.WorkflowDefinition{
		Entrypoint: "start", MaxIterations: 100,
		Nodes: []model.NodeDefinition{
			{ID: "start", Type: model.NodeTypeTerminal},
			{ID: "act", Type: model.NodeTypeAction, Handler: "h", Input: `{"val": ctx.x}`},
			{ID: "end", Type: model.NodeTypeTerminal},
		},
		Edges: []model.EdgeDefinition{
			{From: "start", To: "act"},
			{From: "act", To: "end"},
		},
	}
	w := graph.NewWalker(def, map[string]any{"x": 99})
	cmd := w.Next()
	if cmd.Type != graph.CmdExecuteAction {
		t.Fatalf("expected execute_action, got %s", cmd.Type)
	}
	// CEL may return int64 for integer values
	val, ok := cmd.Input["val"]
	if !ok {
		t.Fatal("expected val in input")
	}
	switch v := val.(type) {
	case int64:
		if v != 99 {
			t.Fatalf("expected 99, got %d", v)
		}
	case int:
		if v != 99 {
			t.Fatalf("expected 99, got %d", v)
		}
	default:
		t.Fatalf("expected int, got %T: %v", val, val)
	}
}
