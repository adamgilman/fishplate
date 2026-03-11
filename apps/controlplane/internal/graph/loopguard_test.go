package graph_test

import (
	"testing"

	"github.com/adamgilman/fishplate/apps/controlplane/internal/graph"
)

func TestLoopGuard_AllowsUnderLimit(t *testing.T) {
	lg := graph.NewLoopGuard(3)
	if !lg.Check("a", "b", 0) {
		t.Fatal("expected allowed")
	}
	if !lg.Check("a", "b", 0) {
		t.Fatal("expected allowed")
	}
	if !lg.Check("a", "b", 0) {
		t.Fatal("expected allowed on 3rd")
	}
}

func TestLoopGuard_BlocksOverLimit(t *testing.T) {
	lg := graph.NewLoopGuard(2)
	lg.Check("a", "b", 0)
	lg.Check("a", "b", 0)
	if lg.Check("a", "b", 0) {
		t.Fatal("expected blocked on 3rd with limit 2")
	}
}

func TestLoopGuard_EdgeOverride(t *testing.T) {
	lg := graph.NewLoopGuard(100)
	lg.Check("a", "b", 1)
	if lg.Check("a", "b", 1) {
		t.Fatal("expected blocked by edge override of 1")
	}
}

func TestLoopGuard_GetLoopMap(t *testing.T) {
	lg := graph.NewLoopGuard(10)
	lg.Check("a", "b", 0)
	lg.Check("a", "b", 0)
	lg.Check("c", "d", 0)
	m := lg.GetLoopMap()
	if m["a->b"] != 2 {
		t.Fatalf("expected a->b=2, got %d", m["a->b"])
	}
	if m["c->d"] != 1 {
		t.Fatalf("expected c->d=1, got %d", m["c->d"])
	}
}
