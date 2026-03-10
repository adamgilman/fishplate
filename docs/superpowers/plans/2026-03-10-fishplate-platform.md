# Fishplate Platform Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the fishplate control plane (Go) and worker (Go) so that a workflow with action + decision nodes executes end-to-end via ConnectRPC task dispatch.

**Architecture:** Go control plane uses DBOS-Go for durable workflow execution, cel-go for condition evaluation, and ConnectRPC for the API. A separate Go worker binary polls for tasks and executes handlers. Protobuf defines the RPC contract. Both are separate Go modules under `apps/`.

**Tech Stack:** Go, DBOS-Go, ConnectRPC (connect-go), cel-go, buf (protobuf), Postgres

**Spec:** `docs/superpowers/specs/2026-03-10-fishplate-platform-architecture.md`

---

## File Structure

```
libs/proto/
├── buf.yaml
├── buf.gen.yaml
├── fishplate/worker/v1/worker.proto      # WorkerService (GetTask, SubmitTaskResult)
├── fishplate/admin/v1/admin.proto        # AdminService (stub for now)
└── gen/go/                               # generated Go code (gitignored output dir)

apps/controlplane/
├── go.mod
├── go.sum
├── cmd/server/main.go                    # entrypoint
├── internal/
│   ├── model/
│   │   ├── definition.go                 # WorkflowDefinition, NodeDefinition, EdgeDefinition
│   │   ├── execution.go                  # WorkflowExecution, ExecutionStatus
│   │   └── task.go                       # Task, TaskStatus
│   ├── cel/
│   │   ├── evaluator.go                  # CelEvaluator (wraps cel-go)
│   │   └── evaluator_test.go
│   ├── graph/
│   │   ├── walker.go                     # GraphWalker (port of TS walker)
│   │   ├── walker_test.go
│   │   ├── loopguard.go                  # LoopGuard
│   │   └── loopguard_test.go
│   ├── dispatcher/
│   │   ├── dispatcher.go                 # CreateTask, ClaimTask, CompleteTask
│   │   └── dispatcher_test.go
│   ├── orchestrator/
│   │   ├── orchestrator.go               # DBOS workflow that drives the walker
│   │   └── orchestrator_test.go
│   ├── auth/
│   │   ├── auth.go                       # ValidateAPIKey
│   │   └── auth_test.go
│   └── api/
│       ├── worker_handler.go             # WorkerService ConnectRPC handler
│       └── worker_handler_test.go
└── migrations/
    ├── 001_initial.sql                   # existing schema (tenants, definitions, executions)
    └── 002_tasks_and_keys.sql            # tasks + api_keys tables

apps/worker/
├── go.mod
├── go.sum
├── cmd/worker/main.go                    # entrypoint
└── pkg/worker/
    ├── worker.go                         # Worker struct, Handle(), Run()
    └── worker_test.go
```

---

## Chunk 1: Proto Definitions + Code Generation

### Task 1: Set up buf and proto files

**Files:**
- Create: `libs/proto/buf.yaml`
- Create: `libs/proto/buf.gen.yaml`
- Create: `libs/proto/fishplate/worker/v1/worker.proto`
- Create: `libs/proto/fishplate/admin/v1/admin.proto`

- [ ] **Step 1: Install buf CLI**

Run: `go install github.com/bufbuild/buf/cmd/buf@latest`
Expected: buf binary available at `$(go env GOPATH)/bin/buf`

- [ ] **Step 2: Create buf.yaml**

```yaml
# libs/proto/buf.yaml
version: v2
modules:
  - path: .
lint:
  use:
    - STANDARD
breaking:
  use:
    - FILE
```

- [ ] **Step 3: Create buf.gen.yaml**

```yaml
# libs/proto/buf.gen.yaml
version: v2
plugins:
  - remote: buf.build/protocolbuffers/go
    out: gen/go
    opt: paths=source_relative
  - remote: buf.build/connectrpc/go
    out: gen/go
    opt: paths=source_relative
```

- [ ] **Step 4: Create worker.proto**

```protobuf
// libs/proto/fishplate/worker/v1/worker.proto
syntax = "proto3";

package fishplate.worker.v1;

option go_package = "fishplate/gen/go/fishplate/worker/v1;workerv1";

service WorkerService {
  rpc GetTask(GetTaskRequest) returns (GetTaskResponse);
  rpc SubmitTaskResult(SubmitTaskResultRequest) returns (SubmitTaskResultResponse);
}

message GetTaskRequest {
  string worker_id = 1;
  string tenant_id = 2;
}

message GetTaskResponse {
  // Empty fields = no work available
  optional string task_id = 1;
  optional string handler = 2;
  optional bytes input = 3;
}

message SubmitTaskResultRequest {
  string task_id = 1;
  TaskStatus status = 2;
  optional bytes context_updates = 3;
  optional string error = 4;
}

enum TaskStatus {
  TASK_STATUS_UNSPECIFIED = 0;
  TASK_STATUS_SUCCESS = 1;
  TASK_STATUS_ERROR = 2;
}

message SubmitTaskResultResponse {}
```

- [ ] **Step 5: Create admin.proto (stub)**

```protobuf
// libs/proto/fishplate/admin/v1/admin.proto
syntax = "proto3";

package fishplate.admin.v1;

option go_package = "fishplate/gen/go/fishplate/admin/v1;adminv1";

service AdminService {
  rpc GetWorkflowExecution(GetWorkflowExecutionRequest) returns (GetWorkflowExecutionResponse);
  rpc ListWorkflowExecutions(ListWorkflowExecutionsRequest) returns (ListWorkflowExecutionsResponse);
  rpc StartWorkflow(StartWorkflowRequest) returns (StartWorkflowResponse);
}

message GetWorkflowExecutionRequest {
  string execution_id = 1;
}

message GetWorkflowExecutionResponse {
  // TODO: flesh out when wiring admin UI
}

message ListWorkflowExecutionsRequest {
  string tenant_id = 1;
}

message ListWorkflowExecutionsResponse {
  // TODO: flesh out when wiring admin UI
}

message StartWorkflowRequest {
  string definition_id = 1;
  bytes params = 2;
}

message StartWorkflowResponse {
  string execution_id = 1;
}
```

- [ ] **Step 6: Generate Go code**

Run: `cd libs/proto && buf generate`
Expected: files generated under `libs/proto/gen/go/fishplate/worker/v1/` and `libs/proto/gen/go/fishplate/admin/v1/`

- [ ] **Step 7: Verify generated files exist**

Run: `ls libs/proto/gen/go/fishplate/worker/v1/`
Expected: `worker.pb.go` and `workerv1connect/worker.connect.go` (or similar connect output)

- [ ] **Step 8: Commit**

```bash
git add libs/proto/
git commit -m "feat: add protobuf definitions and buf code generation for WorkerService and AdminService"
```

---

## Chunk 2: Control Plane — Domain Model + CEL + Graph Walker

### Task 2: Scaffold the controlplane Go module

**Files:**
- Create: `apps/controlplane/go.mod`
- Create: `apps/controlplane/cmd/server/main.go`

- [ ] **Step 1: Initialize Go module**

Run: `cd apps/controlplane && go mod init github.com/adamgilman/fishplate/apps/controlplane`
Expected: `go.mod` created

- [ ] **Step 2: Create placeholder main.go**

```go
// apps/controlplane/cmd/server/main.go
package main

import "fmt"

func main() {
	fmt.Println("fishplate control plane")
}
```

- [ ] **Step 3: Verify it builds**

Run: `cd apps/controlplane && go build ./cmd/server/`
Expected: builds without errors

- [ ] **Step 4: Commit**

```bash
git add apps/controlplane/
git commit -m "chore: scaffold controlplane Go module"
```

---

### Task 3: Domain model types

**Files:**
- Create: `apps/controlplane/internal/model/definition.go`
- Create: `apps/controlplane/internal/model/execution.go`
- Create: `apps/controlplane/internal/model/task.go`

- [ ] **Step 1: Create definition.go**

Port from `workflow-core` TypeScript types:

```go
// apps/controlplane/internal/model/definition.go
package model

type NodeType string

const (
	NodeTypeAction   NodeType = "action"
	NodeTypeDecision NodeType = "decision"
	NodeTypeFork     NodeType = "fork"
	NodeTypeGate     NodeType = "gate"
	NodeTypeTerminal NodeType = "terminal"
	NodeTypeWorkflow NodeType = "workflow"
)

type WorkflowDefinition struct {
	ID            string
	TenantID      string
	Name          string
	Version       int
	IsTemplate    bool
	CreatedBy     string
	Entrypoint    string
	Nodes         []NodeDefinition
	Edges         []EdgeDefinition
	MaxIterations int // default 100
}

type NodeDefinition struct {
	ID              string
	Type            NodeType
	Handler         string // action nodes
	Input           string // CEL expression
	WorkflowRef     string // workflow nodes
	WorkflowVersion int
	WorkflowInput   string // CEL expression
	TimeoutMs       int    // gate nodes
	TimeoutEdge     string
	Branches        []string // fork nodes
	JoinNode        string
}

type EdgeDefinition struct {
	From          string
	To            string
	When          string // CEL boolean expression
	Priority      int
	MaxIterations int // per-edge loop limit override (0 = use global)
}
```

- [ ] **Step 2: Create execution.go**

```go
// apps/controlplane/internal/model/execution.go
package model

import "time"

type ExecutionStatus string

const (
	ExecutionPending   ExecutionStatus = "pending"
	ExecutionRunning   ExecutionStatus = "running"
	ExecutionCompleted ExecutionStatus = "completed"
	ExecutionFailed    ExecutionStatus = "failed"
	ExecutionWaiting   ExecutionStatus = "waiting"
)

type WorkflowExecution struct {
	ID                string
	TenantID          string
	DefinitionID      string
	ParentExecutionID string
	DBOSWorkflowID   string
	Status            ExecutionStatus
	CurrentNodeID     string
	Context           map[string]any
	Params            map[string]any
	Error             string
	StartedAt         *time.Time
	CompletedAt       *time.Time
	CreatedAt         time.Time
}
```

- [ ] **Step 3: Create task.go**

```go
// apps/controlplane/internal/model/task.go
package model

import "time"

type TaskStatus string

const (
	TaskPending   TaskStatus = "pending"
	TaskClaimed   TaskStatus = "claimed"
	TaskCompleted TaskStatus = "completed"
	TaskFailed    TaskStatus = "failed"
)

type Task struct {
	ID          string
	TenantID    string
	ExecutionID string
	NodeID      string
	Handler     string
	Input       map[string]any
	Status      TaskStatus
	WorkerID    string
	Result      map[string]any
	Error       string
	Deadline    time.Time
	CreatedAt   time.Time
	ClaimedAt   *time.Time
	CompletedAt *time.Time
}
```

- [ ] **Step 4: Verify it compiles**

Run: `cd apps/controlplane && go build ./internal/model/`
Expected: builds without errors

- [ ] **Step 5: Commit**

```bash
git add apps/controlplane/internal/model/
git commit -m "feat(controlplane): add domain model types for definitions, executions, and tasks"
```

---

### Task 4: CEL evaluator

**Files:**
- Create: `apps/controlplane/internal/cel/evaluator.go`
- Create: `apps/controlplane/internal/cel/evaluator_test.go`

- [ ] **Step 1: Write failing tests**

```go
// apps/controlplane/internal/cel/evaluator_test.go
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
	result, err := e.EvaluateCondition("_loop[\"review->generate\"] < 5", ctx, loops)
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
	result, err := e.EvaluateInput("{\"task\": ctx.task, \"model\": ctx.model}", ctx, nil)
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/controlplane && go test ./internal/cel/`
Expected: FAIL — package doesn't exist yet

- [ ] **Step 3: Implement evaluator**

```go
// apps/controlplane/internal/cel/evaluator.go
package cel

import (
	"fmt"

	"github.com/google/cel-go/cel"
	"github.com/google/cel-go/common/types"
	"github.com/google/cel-go/common/types/ref"
)

// Evaluator wraps cel-go for workflow condition and input evaluation.
type Evaluator struct{}

func NewEvaluator() *Evaluator {
	return &Evaluator{}
}

func (e *Evaluator) buildEnv(ctx map[string]any, loops map[string]int64) (*cel.Env, map[string]any) {
	vars := map[string]any{}

	envOpts := []cel.EnvOption{}

	if ctx != nil {
		envOpts = append(envOpts, cel.Variable("ctx", cel.MapType(cel.StringType, cel.DynType)))
		vars["ctx"] = ctx
	}

	if loops != nil {
		envOpts = append(envOpts, cel.Variable("_loop", cel.MapType(cel.StringType, cel.IntType)))
		vars["_loop"] = loops
	} else {
		envOpts = append(envOpts, cel.Variable("_loop", cel.MapType(cel.StringType, cel.IntType)))
		vars["_loop"] = map[string]int64{}
	}

	env, err := cel.NewEnv(envOpts...)
	if err != nil {
		// Should not happen with valid options
		panic(fmt.Sprintf("cel env creation failed: %v", err))
	}

	return env, vars
}

// EvaluateCondition evaluates a CEL expression that must return a boolean.
func (e *Evaluator) EvaluateCondition(expression string, ctx map[string]any, loops map[string]int64) (bool, error) {
	env, vars := e.buildEnv(ctx, loops)

	ast, issues := env.Compile(expression)
	if issues != nil && issues.Err() != nil {
		return false, fmt.Errorf("CEL compile error: %w", issues.Err())
	}

	prg, err := env.Program(ast)
	if err != nil {
		return false, fmt.Errorf("CEL program error: %w", err)
	}

	out, _, err := prg.Eval(vars)
	if err != nil {
		return false, fmt.Errorf("CEL eval error: %w", err)
	}

	b, ok := out.Value().(bool)
	if !ok {
		return false, fmt.Errorf("CEL condition returned %T, expected bool", out.Value())
	}
	return b, nil
}

// EvaluateInput evaluates a CEL expression that must return a map.
func (e *Evaluator) EvaluateInput(expression string, ctx map[string]any, loops map[string]int64) (map[string]any, error) {
	env, vars := e.buildEnv(ctx, loops)

	ast, issues := env.Compile(expression)
	if issues != nil && issues.Err() != nil {
		return nil, fmt.Errorf("CEL compile error: %w", issues.Err())
	}

	prg, err := env.Program(ast)
	if err != nil {
		return nil, fmt.Errorf("CEL program error: %w", err)
	}

	out, _, err := prg.Eval(vars)
	if err != nil {
		return nil, fmt.Errorf("CEL eval error: %w", err)
	}

	// Convert cel ref.Val map to Go map
	if m, ok := out.(ref.Val); ok {
		if nativeVal, err := m.ConvertToNative(types.DefaultTypeAdapter.NativeToValue(map[string]any{}).Type().ReflectType()); err == nil {
			if goMap, ok := nativeVal.(map[string]any); ok {
				return goMap, nil
			}
		}
		// Fallback: try direct conversion
		if goMap, ok := out.Value().(map[string]any); ok {
			return goMap, nil
		}
		if refMap, ok := out.Value().(map[ref.Val]ref.Val); ok {
			result := make(map[string]any, len(refMap))
			for k, v := range refMap {
				result[fmt.Sprint(k.Value())] = v.Value()
			}
			return result, nil
		}
	}

	return nil, fmt.Errorf("CEL input returned %T, expected map", out.Value())
}
```

- [ ] **Step 4: Add cel-go dependency**

Run: `cd apps/controlplane && go get github.com/google/cel-go@latest`

- [ ] **Step 5: Run tests**

Run: `cd apps/controlplane && go test ./internal/cel/ -v`
Expected: all 5 tests PASS

- [ ] **Step 6: Commit**

```bash
git add apps/controlplane/internal/cel/ apps/controlplane/go.mod apps/controlplane/go.sum
git commit -m "feat(controlplane): add CEL evaluator wrapping cel-go"
```

---

### Task 5: Loop guard

**Files:**
- Create: `apps/controlplane/internal/graph/loopguard.go`
- Create: `apps/controlplane/internal/graph/loopguard_test.go`

- [ ] **Step 1: Write failing tests**

```go
// apps/controlplane/internal/graph/loopguard_test.go
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/controlplane && go test ./internal/graph/`
Expected: FAIL

- [ ] **Step 3: Implement loop guard**

```go
// apps/controlplane/internal/graph/loopguard.go
package graph

import "fmt"

// LoopGuard tracks edge traversal counts and enforces iteration limits.
type LoopGuard struct {
	globalLimit int
	counts      map[string]int64
}

func NewLoopGuard(globalLimit int) *LoopGuard {
	return &LoopGuard{
		globalLimit: globalLimit,
		counts:      make(map[string]int64),
	}
}

// Check increments the traversal count for from->to and returns true if within limit.
// edgeLimit of 0 means use the global limit.
func (lg *LoopGuard) Check(from, to string, edgeLimit int) bool {
	key := fmt.Sprintf("%s->%s", from, to)
	lg.counts[key]++
	limit := lg.globalLimit
	if edgeLimit > 0 {
		limit = edgeLimit
	}
	return lg.counts[key] <= int64(limit)
}

// GetLoopMap returns a copy of traversal counts for CEL context.
func (lg *LoopGuard) GetLoopMap() map[string]int64 {
	m := make(map[string]int64, len(lg.counts))
	for k, v := range lg.counts {
		m[k] = v
	}
	return m
}
```

- [ ] **Step 4: Run tests**

Run: `cd apps/controlplane && go test ./internal/graph/ -v`
Expected: all 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add apps/controlplane/internal/graph/
git commit -m "feat(controlplane): add loop guard for edge traversal limits"
```

---

### Task 6: Graph walker

**Files:**
- Create: `apps/controlplane/internal/graph/walker.go`
- Create: `apps/controlplane/internal/graph/walker_test.go`

- [ ] **Step 1: Write failing tests**

```go
// apps/controlplane/internal/graph/walker_test.go
package graph_test

import (
	"testing"

	"github.com/adamgilman/fishplate/apps/controlplane/internal/graph"
	"github.com/adamgilman/fishplate/apps/controlplane/internal/model"
)

func linearDef() *model.WorkflowDefinition {
	return &model.WorkflowDefinition{
		Entrypoint:    "start",
		MaxIterations: 100,
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
		Entrypoint:    "start",
		MaxIterations: 100,
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
			{From: "check", To: "no_action", Priority: 1},
			{From: "yes_action", To: "end"},
			{From: "no_action", To: "end"},
		},
	}
}

func TestWalker_LinearWorkflow(t *testing.T) {
	w := graph.NewWalker(linearDef(), map[string]any{})

	// First next: terminal start → follows edge → yields execute_action
	cmd := w.Next()
	if cmd.Type != graph.CmdExecuteAction {
		t.Fatalf("expected execute_action, got %s", cmd.Type)
	}
	if cmd.Handler != "my_handler" {
		t.Fatalf("expected my_handler, got %s", cmd.Handler)
	}

	// Resolve with context updates
	w.Resolve(graph.CommandResult{ContextUpdates: map[string]any{"result": 42}})

	// Next: follows edge → terminal → complete
	cmd = w.Next()
	if cmd.Type != graph.CmdComplete {
		t.Fatalf("expected complete, got %s", cmd.Type)
	}
	if cmd.Context["result"] != 42 {
		t.Fatalf("expected result=42 in context")
	}
}

func TestWalker_DecisionTrue(t *testing.T) {
	w := graph.NewWalker(decisionDef(), map[string]any{"flag": true})

	// start terminal → check decision (flag=true) → yes_action
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

	// start terminal → check decision (flag=false, falls to default) → no_action
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
	w.Next() // execute_action
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
	def := &model.WorkflowDefinition{
		Entrypoint:    "nonexistent",
		MaxIterations: 100,
		Nodes:         []model.NodeDefinition{},
		Edges:         []model.EdgeDefinition{},
	}
	w := graph.NewWalker(def, map[string]any{})
	cmd := w.Next()
	if cmd.Type != graph.CmdFail {
		t.Fatalf("expected fail, got %s", cmd.Type)
	}
}

func TestWalker_CELInput(t *testing.T) {
	def := &model.WorkflowDefinition{
		Entrypoint:    "start",
		MaxIterations: 100,
		Nodes: []model.NodeDefinition{
			{ID: "start", Type: model.NodeTypeTerminal},
			{ID: "act", Type: model.NodeTypeAction, Handler: "h", Input: "{\"val\": ctx.x}"},
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
	if cmd.Input["val"] != int64(99) {
		t.Fatalf("expected val=99, got %v (%T)", cmd.Input["val"], cmd.Input["val"])
	}
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/controlplane && go test ./internal/graph/ -v`
Expected: FAIL — walker.go doesn't exist yet

- [ ] **Step 3: Implement the graph walker**

```go
// apps/controlplane/internal/graph/walker.go
package graph

import (
	"fmt"
	"sort"

	"github.com/adamgilman/fishplate/apps/controlplane/internal/cel"
	"github.com/adamgilman/fishplate/apps/controlplane/internal/model"
)

type CommandType string

const (
	CmdExecuteAction   CommandType = "execute_action"
	CmdExecuteWorkflow CommandType = "execute_workflow"
	CmdFork            CommandType = "fork"
	CmdWaitForSignal   CommandType = "wait_for_signal"
	CmdComplete        CommandType = "complete"
	CmdFail            CommandType = "fail"
)

type WalkerCommand struct {
	Type            CommandType
	NodeID          string
	Handler         string
	Input           map[string]any
	WorkflowRef     string
	WorkflowVersion int
	Branches        []string
	JoinNode        string
	TimeoutMs       int
	Context         map[string]any
	Reason          string
}

type CommandResult struct {
	ContextUpdates map[string]any
	SignalReceived bool
	Error          string
}

type Walker struct {
	definition  *model.WorkflowDefinition
	ctx         map[string]any
	cursorNode  string
	stopNode    string
	nodeMap     map[string]*model.NodeDefinition
	edgesByFrom map[string][]model.EdgeDefinition
	celEval     *cel.Evaluator
	loopGuard   *LoopGuard
	pendingErr  string
}

func NewWalker(def *model.WorkflowDefinition, params map[string]any) *Walker {
	ctx := make(map[string]any, len(params))
	for k, v := range params {
		ctx[k] = v
	}

	nodeMap := make(map[string]*model.NodeDefinition, len(def.Nodes))
	for i := range def.Nodes {
		nodeMap[def.Nodes[i].ID] = &def.Nodes[i]
	}

	edgesByFrom := make(map[string][]model.EdgeDefinition)
	for _, edge := range def.Edges {
		edgesByFrom[edge.From] = append(edgesByFrom[edge.From], edge)
	}

	maxIter := def.MaxIterations
	if maxIter == 0 {
		maxIter = 100
	}

	return &Walker{
		definition:  def,
		ctx:         ctx,
		cursorNode:  def.Entrypoint,
		nodeMap:     nodeMap,
		edgesByFrom: edgesByFrom,
		celEval:     cel.NewEvaluator(),
		loopGuard:   NewLoopGuard(maxIter),
	}
}

func (w *Walker) SetBounds(startNode, stopNode string) {
	w.cursorNode = startNode
	w.stopNode = stopNode
}

func (w *Walker) Next() WalkerCommand {
	if w.pendingErr != "" {
		err := w.pendingErr
		w.pendingErr = ""
		return WalkerCommand{Type: CmdFail, NodeID: w.cursorNode, Reason: err}
	}

	for {
		if w.stopNode != "" && w.cursorNode == w.stopNode {
			return WalkerCommand{Type: CmdComplete, Context: w.copyCtx()}
		}

		node, ok := w.nodeMap[w.cursorNode]
		if !ok {
			return WalkerCommand{Type: CmdFail, NodeID: w.cursorNode, Reason: fmt.Sprintf("node '%s' not found", w.cursorNode)}
		}

		switch node.Type {
		case model.NodeTypeTerminal:
			// Terminal with outgoing edges = start node, follow the edge
			edges := w.edgesByFrom[node.ID]
			if len(edges) == 0 {
				return WalkerCommand{Type: CmdComplete, Context: w.copyCtx()}
			}
			if !w.loopGuard.Check(edges[0].From, edges[0].To, edges[0].MaxIterations) {
				return WalkerCommand{Type: CmdFail, NodeID: node.ID, Reason: fmt.Sprintf("loop limit exceeded on edge '%s->%s'", edges[0].From, edges[0].To)}
			}
			w.cursorNode = edges[0].To
			continue

		case model.NodeTypeDecision:
			nextNode := w.resolveDecision(node)
			if nextNode == "" {
				if w.pendingErr != "" {
					err := w.pendingErr
					w.pendingErr = ""
					return WalkerCommand{Type: CmdFail, NodeID: node.ID, Reason: err}
				}
				return WalkerCommand{Type: CmdFail, NodeID: node.ID, Reason: fmt.Sprintf("no matching edge from decision node '%s'", node.ID)}
			}
			w.cursorNode = nextNode
			continue

		case model.NodeTypeAction:
			input, err := w.evaluateInput(node)
			if err != "" {
				return WalkerCommand{Type: CmdFail, NodeID: node.ID, Reason: err}
			}
			return WalkerCommand{Type: CmdExecuteAction, NodeID: node.ID, Handler: node.Handler, Input: input}

		case model.NodeTypeWorkflow:
			expr := node.WorkflowInput
			if expr == "" {
				expr = node.Input
			}
			var input map[string]any
			if expr != "" {
				tmpNode := &model.NodeDefinition{ID: node.ID, Input: expr}
				var errStr string
				input, errStr = w.evaluateInput(tmpNode)
				if errStr != "" {
					return WalkerCommand{Type: CmdFail, NodeID: node.ID, Reason: errStr}
				}
			} else {
				input = map[string]any{}
			}
			return WalkerCommand{Type: CmdExecuteWorkflow, NodeID: node.ID, WorkflowRef: node.WorkflowRef, WorkflowVersion: node.WorkflowVersion, Input: input}

		case model.NodeTypeFork:
			return WalkerCommand{Type: CmdFork, NodeID: node.ID, Branches: node.Branches, JoinNode: node.JoinNode}

		case model.NodeTypeGate:
			return WalkerCommand{Type: CmdWaitForSignal, NodeID: node.ID, TimeoutMs: node.TimeoutMs}

		default:
			return WalkerCommand{Type: CmdFail, NodeID: node.ID, Reason: fmt.Sprintf("unknown node type '%s'", node.Type)}
		}
	}
}

func (w *Walker) Resolve(result CommandResult) {
	if result.Error != "" {
		w.pendingErr = result.Error
		return
	}

	for k, v := range result.ContextUpdates {
		w.ctx[k] = v
	}

	node := w.nodeMap[w.cursorNode]

	if node.Type == model.NodeTypeGate {
		if result.SignalReceived {
			w.advanceToNextEdge(node.ID)
		} else if node.TimeoutEdge != "" {
			w.cursorNode = node.TimeoutEdge
		} else {
			w.pendingErr = fmt.Sprintf("gate '%s' timed out with no timeoutEdge", node.ID)
		}
		return
	}

	if node.Type == model.NodeTypeFork {
		w.cursorNode = node.JoinNode
		return
	}

	w.advanceToNextEdge(node.ID)
}

func (w *Walker) GetContext() map[string]any {
	return w.copyCtx()
}

func (w *Walker) resolveDecision(node *model.NodeDefinition) string {
	edges := append([]model.EdgeDefinition{}, w.edgesByFrom[node.ID]...)
	sort.Slice(edges, func(i, j int) bool {
		return edges[i].Priority < edges[j].Priority
	})

	loops := w.loopGuard.GetLoopMap()

	for _, edge := range edges {
		if edge.When == "" {
			if !w.loopGuard.Check(edge.From, edge.To, edge.MaxIterations) {
				w.pendingErr = fmt.Sprintf("loop limit exceeded on edge '%s->%s'", edge.From, edge.To)
				return ""
			}
			return edge.To
		}

		result, err := w.celEval.EvaluateCondition(edge.When, w.ctx, loops)
		if err != nil {
			w.pendingErr = fmt.Sprintf("CEL expression on edge '%s->%s' failed: %v", edge.From, edge.To, err)
			return ""
		}
		if result {
			if !w.loopGuard.Check(edge.From, edge.To, edge.MaxIterations) {
				w.pendingErr = fmt.Sprintf("loop limit exceeded on edge '%s->%s'", edge.From, edge.To)
				return ""
			}
			return edge.To
		}
	}

	return ""
}

func (w *Walker) evaluateInput(node *model.NodeDefinition) (map[string]any, string) {
	if node.Input == "" {
		return map[string]any{}, ""
	}
	loops := w.loopGuard.GetLoopMap()
	result, err := w.celEval.EvaluateInput(node.Input, w.ctx, loops)
	if err != nil {
		return nil, fmt.Sprintf("CEL input on node '%s' failed: %v", node.ID, err)
	}
	return result, ""
}

func (w *Walker) advanceToNextEdge(nodeID string) {
	edges := w.edgesByFrom[nodeID]
	if len(edges) == 0 {
		return
	}
	edge := edges[0]
	if !w.loopGuard.Check(edge.From, edge.To, edge.MaxIterations) {
		w.pendingErr = fmt.Sprintf("loop limit exceeded on edge '%s->%s'", edge.From, edge.To)
		return
	}
	w.cursorNode = edge.To
}

func (w *Walker) copyCtx() map[string]any {
	c := make(map[string]any, len(w.ctx))
	for k, v := range w.ctx {
		c[k] = v
	}
	return c
}
```

- [ ] **Step 4: Run tests**

Run: `cd apps/controlplane && go test ./internal/graph/ -v`
Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add apps/controlplane/internal/graph/
git commit -m "feat(controlplane): add graph walker ported from workflow-core TypeScript"
```

---

## Chunk 3: Control Plane — Database, Dispatcher, API

### Task 7: Database migration for tasks and API keys

**Files:**
- Create: `apps/controlplane/migrations/001_initial.sql`
- Create: `apps/controlplane/migrations/002_tasks_and_keys.sql`

- [ ] **Step 1: Copy existing schema as 001**

```sql
-- apps/controlplane/migrations/001_initial.sql
-- Copied from libs/workflow-core/src/storage/migrations/001_initial.sql
CREATE TABLE IF NOT EXISTS tenants (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS workflow_definitions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id),
  name        TEXT NOT NULL,
  version     INTEGER NOT NULL DEFAULT 1,
  definition  JSONB NOT NULL,
  is_template BOOLEAN NOT NULL DEFAULT false,
  created_by  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, name, version)
);

CREATE TABLE IF NOT EXISTS workflow_executions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id),
  definition_id       UUID NOT NULL REFERENCES workflow_definitions(id),
  parent_execution_id UUID REFERENCES workflow_executions(id),
  dbos_workflow_id    TEXT,
  status              TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'running', 'completed', 'failed', 'waiting')),
  current_node_id     TEXT,
  context             JSONB NOT NULL DEFAULT '{}',
  params              JSONB NOT NULL DEFAULT '{}',
  error               TEXT,
  started_at          TIMESTAMPTZ,
  completed_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE workflow_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_executions ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_definitions ON workflow_definitions
  USING (tenant_id = current_setting('app.tenant_id')::UUID);

CREATE POLICY tenant_isolation_executions ON workflow_executions
  USING (tenant_id = current_setting('app.tenant_id')::UUID);
```

- [ ] **Step 2: Create 002 migration for tasks and API keys**

```sql
-- apps/controlplane/migrations/002_tasks_and_keys.sql
CREATE TABLE IF NOT EXISTS tasks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id),
  execution_id  UUID NOT NULL REFERENCES workflow_executions(id),
  node_id       TEXT NOT NULL,
  handler       TEXT NOT NULL,
  input         JSONB NOT NULL DEFAULT '{}',
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'claimed', 'completed', 'failed')),
  worker_id     TEXT,
  result        JSONB,
  error         TEXT,
  deadline      TIMESTAMPTZ NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  claimed_at    TIMESTAMPTZ,
  completed_at  TIMESTAMPTZ
);

CREATE INDEX idx_tasks_pending ON tasks (tenant_id, status, created_at)
  WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS api_keys (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id),
  key_hash    TEXT NOT NULL,
  name        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at  TIMESTAMPTZ
);

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_tasks ON tasks
  USING (tenant_id = current_setting('app.tenant_id')::UUID);

CREATE POLICY tenant_isolation_api_keys ON api_keys
  USING (tenant_id = current_setting('app.tenant_id')::UUID);
```

- [ ] **Step 3: Commit**

```bash
git add apps/controlplane/migrations/
git commit -m "feat(controlplane): add database migrations for tasks and api_keys tables"
```

---

### Task 8: Task dispatcher (Postgres operations)

**Files:**
- Create: `apps/controlplane/internal/dispatcher/dispatcher.go`
- Create: `apps/controlplane/internal/dispatcher/dispatcher_test.go`

- [ ] **Step 1: Write failing tests**

Tests use a mock DB interface — no real Postgres needed for unit tests.

```go
// apps/controlplane/internal/dispatcher/dispatcher_test.go
package dispatcher_test

import (
	"context"
	"testing"
	"time"

	"github.com/adamgilman/fishplate/apps/controlplane/internal/dispatcher"
	"github.com/adamgilman/fishplate/apps/controlplane/internal/model"
)

// mockDB implements dispatcher.DB for testing
type mockDB struct {
	tasks map[string]*model.Task
}

func newMockDB() *mockDB {
	return &mockDB{tasks: make(map[string]*model.Task)}
}

func (m *mockDB) CreateTask(ctx context.Context, task *model.Task) error {
	m.tasks[task.ID] = task
	return nil
}

func (m *mockDB) ClaimTask(ctx context.Context, tenantID, workerID string) (*model.Task, error) {
	for _, t := range m.tasks {
		if t.TenantID == tenantID && t.Status == model.TaskPending {
			t.Status = model.TaskClaimed
			t.WorkerID = workerID
			now := time.Now()
			t.ClaimedAt = &now
			return t, nil
		}
	}
	return nil, nil
}

func (m *mockDB) CompleteTask(ctx context.Context, taskID string, result map[string]any) error {
	t := m.tasks[taskID]
	t.Status = model.TaskCompleted
	t.Result = result
	return nil
}

func (m *mockDB) FailTask(ctx context.Context, taskID string, errMsg string) error {
	t := m.tasks[taskID]
	t.Status = model.TaskFailed
	t.Error = errMsg
	return nil
}

func TestDispatcher_CreateAndClaim(t *testing.T) {
	db := newMockDB()
	d := dispatcher.New(db)
	ctx := context.Background()

	taskID, err := d.CreateTask(ctx, "tenant-1", "exec-1", "node-1", "my_handler", map[string]any{"x": 1}, 30*time.Second)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if taskID == "" {
		t.Fatal("expected non-empty task ID")
	}

	task, err := d.ClaimTask(ctx, "tenant-1", "worker-1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if task == nil {
		t.Fatal("expected a task")
	}
	if task.Handler != "my_handler" {
		t.Fatalf("expected my_handler, got %s", task.Handler)
	}
	if task.Status != model.TaskClaimed {
		t.Fatalf("expected claimed, got %s", task.Status)
	}
}

func TestDispatcher_ClaimEmpty(t *testing.T) {
	db := newMockDB()
	d := dispatcher.New(db)
	ctx := context.Background()

	task, err := d.ClaimTask(ctx, "tenant-1", "worker-1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if task != nil {
		t.Fatal("expected nil task when no work available")
	}
}

func TestDispatcher_CompleteTask(t *testing.T) {
	db := newMockDB()
	d := dispatcher.New(db)
	ctx := context.Background()

	taskID, _ := d.CreateTask(ctx, "tenant-1", "exec-1", "node-1", "h", nil, 30*time.Second)
	d.ClaimTask(ctx, "tenant-1", "worker-1")

	err := d.CompleteTask(ctx, taskID, map[string]any{"result": "ok"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if db.tasks[taskID].Status != model.TaskCompleted {
		t.Fatal("expected completed")
	}
}

func TestDispatcher_FailTask(t *testing.T) {
	db := newMockDB()
	d := dispatcher.New(db)
	ctx := context.Background()

	taskID, _ := d.CreateTask(ctx, "tenant-1", "exec-1", "node-1", "h", nil, 30*time.Second)
	d.ClaimTask(ctx, "tenant-1", "worker-1")

	err := d.FailTask(ctx, taskID, "something broke")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if db.tasks[taskID].Status != model.TaskFailed {
		t.Fatal("expected failed")
	}
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/controlplane && go test ./internal/dispatcher/`
Expected: FAIL

- [ ] **Step 3: Implement dispatcher**

```go
// apps/controlplane/internal/dispatcher/dispatcher.go
package dispatcher

import (
	"context"
	"time"

	"github.com/adamgilman/fishplate/apps/controlplane/internal/model"
	"github.com/google/uuid"
)

// DB is the interface for task persistence. Implemented by Postgres in production, mock in tests.
type DB interface {
	CreateTask(ctx context.Context, task *model.Task) error
	ClaimTask(ctx context.Context, tenantID, workerID string) (*model.Task, error)
	CompleteTask(ctx context.Context, taskID string, result map[string]any) error
	FailTask(ctx context.Context, taskID string, errMsg string) error
}

// Dispatcher manages the task lifecycle.
type Dispatcher struct {
	db DB
}

func New(db DB) *Dispatcher {
	return &Dispatcher{db: db}
}

// CreateTask inserts a new pending task and returns its ID.
func (d *Dispatcher) CreateTask(ctx context.Context, tenantID, executionID, nodeID, handler string, input map[string]any, timeout time.Duration) (string, error) {
	task := &model.Task{
		ID:          uuid.New().String(),
		TenantID:    tenantID,
		ExecutionID: executionID,
		NodeID:      nodeID,
		Handler:     handler,
		Input:       input,
		Status:      model.TaskPending,
		Deadline:    time.Now().Add(timeout),
		CreatedAt:   time.Now(),
	}
	if err := d.db.CreateTask(ctx, task); err != nil {
		return "", err
	}
	return task.ID, nil
}

// ClaimTask atomically claims the next pending task for the given tenant. Returns nil if no work.
func (d *Dispatcher) ClaimTask(ctx context.Context, tenantID, workerID string) (*model.Task, error) {
	return d.db.ClaimTask(ctx, tenantID, workerID)
}

// CompleteTask marks a task as completed with the given result.
func (d *Dispatcher) CompleteTask(ctx context.Context, taskID string, result map[string]any) error {
	return d.db.CompleteTask(ctx, taskID, result)
}

// FailTask marks a task as failed with an error message.
func (d *Dispatcher) FailTask(ctx context.Context, taskID string, errMsg string) error {
	return d.db.FailTask(ctx, taskID, errMsg)
}
```

- [ ] **Step 4: Add uuid dependency**

Run: `cd apps/controlplane && go get github.com/google/uuid@latest`

- [ ] **Step 5: Run tests**

Run: `cd apps/controlplane && go test ./internal/dispatcher/ -v`
Expected: all 4 tests PASS

- [ ] **Step 6: Commit**

```bash
git add apps/controlplane/internal/dispatcher/ apps/controlplane/go.mod apps/controlplane/go.sum
git commit -m "feat(controlplane): add task dispatcher with DB interface"
```

---

### Task 9: API key auth

**Files:**
- Create: `apps/controlplane/internal/auth/auth.go`
- Create: `apps/controlplane/internal/auth/auth_test.go`

- [ ] **Step 1: Write failing tests**

```go
// apps/controlplane/internal/auth/auth_test.go
package auth_test

import (
	"context"
	"testing"

	"github.com/adamgilman/fishplate/apps/controlplane/internal/auth"
)

type mockKeyStore struct {
	keys map[string]string // key_hash -> tenant_id
}

func (m *mockKeyStore) GetTenantByKeyHash(ctx context.Context, keyHash string) (string, error) {
	tid, ok := m.keys[keyHash]
	if !ok {
		return "", nil
	}
	return tid, nil
}

func TestValidateAPIKey_Valid(t *testing.T) {
	store := &mockKeyStore{keys: map[string]string{}}
	a := auth.New(store)

	// Register a key
	key := "fp_test_key_12345"
	hash := auth.HashKey(key)
	store.keys[hash] = "tenant-1"

	tenantID, err := a.Validate(context.Background(), key)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if tenantID != "tenant-1" {
		t.Fatalf("expected tenant-1, got %s", tenantID)
	}
}

func TestValidateAPIKey_Invalid(t *testing.T) {
	store := &mockKeyStore{keys: map[string]string{}}
	a := auth.New(store)

	_, err := a.Validate(context.Background(), "bad_key")
	if err == nil {
		t.Fatal("expected error for invalid key")
	}
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/controlplane && go test ./internal/auth/`
Expected: FAIL

- [ ] **Step 3: Implement auth**

```go
// apps/controlplane/internal/auth/auth.go
package auth

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
)

var ErrInvalidKey = errors.New("invalid API key")

// KeyStore looks up tenant by hashed API key.
type KeyStore interface {
	GetTenantByKeyHash(ctx context.Context, keyHash string) (string, error)
}

type Auth struct {
	store KeyStore
}

func New(store KeyStore) *Auth {
	return &Auth{store: store}
}

// HashKey produces a SHA-256 hex digest of the raw API key.
func HashKey(raw string) string {
	h := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(h[:])
}

// Validate checks the API key and returns the associated tenant ID.
func (a *Auth) Validate(ctx context.Context, rawKey string) (string, error) {
	hash := HashKey(rawKey)
	tenantID, err := a.store.GetTenantByKeyHash(ctx, hash)
	if err != nil {
		return "", err
	}
	if tenantID == "" {
		return "", ErrInvalidKey
	}
	return tenantID, nil
}
```

- [ ] **Step 4: Run tests**

Run: `cd apps/controlplane && go test ./internal/auth/ -v`
Expected: all 2 tests PASS

- [ ] **Step 5: Commit**

```bash
git add apps/controlplane/internal/auth/
git commit -m "feat(controlplane): add API key authentication with SHA-256 hashing"
```

---

### Task 10: ConnectRPC WorkerService handler

**Files:**
- Create: `apps/controlplane/internal/api/worker_handler.go`
- Create: `apps/controlplane/internal/api/worker_handler_test.go`

- [ ] **Step 1: Add connect-go and proto dependencies**

Run:
```bash
cd apps/controlplane
go get connectrpc.com/connect@latest
go get google.golang.org/protobuf@latest
```

Then add a `replace` directive in `go.mod` to point to the local proto gen output (or copy generated code — this depends on how buf output is structured; adjust path accordingly).

- [ ] **Step 2: Write failing tests**

```go
// apps/controlplane/internal/api/worker_handler_test.go
package api_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"connectrpc.com/connect"
	"github.com/adamgilman/fishplate/apps/controlplane/internal/api"
	"github.com/adamgilman/fishplate/apps/controlplane/internal/auth"
	"github.com/adamgilman/fishplate/apps/controlplane/internal/dispatcher"
	"github.com/adamgilman/fishplate/apps/controlplane/internal/model"

	workerv1 "fishplate/gen/go/fishplate/worker/v1"
	"fishplate/gen/go/fishplate/worker/v1/workerv1connect"
)

// Minimal mock implementations for testing

type mockDispatcherDB struct {
	tasks []*model.Task
}

func (m *mockDispatcherDB) CreateTask(_ context.Context, task *model.Task) error {
	m.tasks = append(m.tasks, task)
	return nil
}

func (m *mockDispatcherDB) ClaimTask(_ context.Context, tenantID, workerID string) (*model.Task, error) {
	for _, t := range m.tasks {
		if t.TenantID == tenantID && t.Status == model.TaskPending {
			t.Status = model.TaskClaimed
			t.WorkerID = workerID
			return t, nil
		}
	}
	return nil, nil
}

func (m *mockDispatcherDB) CompleteTask(_ context.Context, taskID string, result map[string]any) error {
	for _, t := range m.tasks {
		if t.ID == taskID {
			t.Status = model.TaskCompleted
			t.Result = result
		}
	}
	return nil
}

func (m *mockDispatcherDB) FailTask(_ context.Context, taskID string, errMsg string) error {
	for _, t := range m.tasks {
		if t.ID == taskID {
			t.Status = model.TaskFailed
			t.Error = errMsg
		}
	}
	return nil
}

type mockKeyStore struct {
	keys map[string]string
}

func (m *mockKeyStore) GetTenantByKeyHash(_ context.Context, hash string) (string, error) {
	return m.keys[hash], nil
}

func setupTestServer(t *testing.T) (workerv1connect.WorkerServiceClient, *mockDispatcherDB, string) {
	t.Helper()
	db := &mockDispatcherDB{}
	d := dispatcher.New(db)

	apiKey := "fp_test_key"
	ks := &mockKeyStore{keys: map[string]string{auth.HashKey(apiKey): "tenant-1"}}
	a := auth.New(ks)

	handler := api.NewWorkerHandler(d, a)
	mux := http.NewServeMux()
	path, h := workerv1connect.NewWorkerServiceHandler(handler)
	mux.Handle(path, h)

	server := httptest.NewServer(mux)
	t.Cleanup(server.Close)

	client := workerv1connect.NewWorkerServiceClient(http.DefaultClient, server.URL)
	return client, db, apiKey
}

func authHeader(key string) connect.ClientOption {
	return connect.WithInterceptors(&authInterceptor{key: key})
}

type authInterceptor struct {
	key string
}

func (i *authInterceptor) WrapUnary(next connect.UnaryFunc) connect.UnaryFunc {
	return func(ctx context.Context, req connect.AnyRequest) (connect.AnyResponse, error) {
		req.Header().Set("Authorization", "Bearer "+i.key)
		return next(ctx, req)
	}
}

func (i *authInterceptor) WrapStreamingClient(next connect.StreamingClientFunc) connect.StreamingClientFunc {
	return next
}

func (i *authInterceptor) WrapStreamingHandler(next connect.StreamingHandlerFunc) connect.StreamingHandlerFunc {
	return next
}

func TestGetTask_NoWork(t *testing.T) {
	client, _, apiKey := setupTestServer(t)
	resp, err := client.GetTask(context.Background(),
		connect.NewRequest(&workerv1.GetTaskRequest{WorkerId: "w1", TenantId: "tenant-1"}),
		authHeader(apiKey),
	)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if resp.Msg.TaskId != nil {
		t.Fatal("expected no task")
	}
}

func TestGetTask_WithWork(t *testing.T) {
	client, db, apiKey := setupTestServer(t)

	// Seed a pending task
	input, _ := json.Marshal(map[string]any{"x": 1})
	db.tasks = append(db.tasks, &model.Task{
		ID:        "task-1",
		TenantID:  "tenant-1",
		Handler:   "my_handler",
		Input:     map[string]any{"x": 1},
		Status:    model.TaskPending,
		Deadline:  time.Now().Add(30 * time.Second),
		CreatedAt: time.Now(),
	})
	_ = input

	resp, err := client.GetTask(context.Background(),
		connect.NewRequest(&workerv1.GetTaskRequest{WorkerId: "w1", TenantId: "tenant-1"}),
		authHeader(apiKey),
	)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if resp.Msg.TaskId == nil || *resp.Msg.TaskId != "task-1" {
		t.Fatalf("expected task-1, got %v", resp.Msg.TaskId)
	}
	if resp.Msg.Handler == nil || *resp.Msg.Handler != "my_handler" {
		t.Fatalf("expected my_handler, got %v", resp.Msg.Handler)
	}
}

func TestGetTask_BadAuth(t *testing.T) {
	client, _, _ := setupTestServer(t)
	_, err := client.GetTask(context.Background(),
		connect.NewRequest(&workerv1.GetTaskRequest{WorkerId: "w1", TenantId: "tenant-1"}),
		authHeader("bad_key"),
	)
	if err == nil {
		t.Fatal("expected auth error")
	}
}
```

- [ ] **Step 3: Implement the handler**

```go
// apps/controlplane/internal/api/worker_handler.go
package api

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"connectrpc.com/connect"
	"github.com/adamgilman/fishplate/apps/controlplane/internal/auth"
	"github.com/adamgilman/fishplate/apps/controlplane/internal/dispatcher"

	workerv1 "fishplate/gen/go/fishplate/worker/v1"
)

type WorkerHandler struct {
	dispatcher *dispatcher.Dispatcher
	auth       *auth.Auth
}

func NewWorkerHandler(d *dispatcher.Dispatcher, a *auth.Auth) *WorkerHandler {
	return &WorkerHandler{dispatcher: d, auth: a}
}

func (h *WorkerHandler) authenticate(ctx context.Context, header map[string][]string) (string, error) {
	authVals := header["Authorization"]
	if len(authVals) == 0 {
		return "", connect.NewError(connect.CodeUnauthenticated, fmt.Errorf("missing Authorization header"))
	}
	token := strings.TrimPrefix(authVals[0], "Bearer ")
	tenantID, err := h.auth.Validate(ctx, token)
	if err != nil {
		return "", connect.NewError(connect.CodeUnauthenticated, fmt.Errorf("invalid API key"))
	}
	return tenantID, nil
}

func (h *WorkerHandler) GetTask(ctx context.Context, req *connect.Request[workerv1.GetTaskRequest]) (*connect.Response[workerv1.GetTaskResponse], error) {
	_, err := h.authenticate(ctx, req.Header())
	if err != nil {
		return nil, err
	}

	task, err := h.dispatcher.ClaimTask(ctx, req.Msg.TenantId, req.Msg.WorkerId)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	resp := &workerv1.GetTaskResponse{}
	if task != nil {
		resp.TaskId = &task.ID
		resp.Handler = &task.Handler
		inputBytes, _ := json.Marshal(task.Input)
		resp.Input = inputBytes
	}

	return connect.NewResponse(resp), nil
}

func (h *WorkerHandler) SubmitTaskResult(ctx context.Context, req *connect.Request[workerv1.SubmitTaskResultRequest]) (*connect.Response[workerv1.SubmitTaskResultResponse], error) {
	_, err := h.authenticate(ctx, req.Header())
	if err != nil {
		return nil, err
	}

	switch req.Msg.Status {
	case workerv1.TaskStatus_TASK_STATUS_SUCCESS:
		var contextUpdates map[string]any
		if req.Msg.ContextUpdates != nil {
			json.Unmarshal(req.Msg.ContextUpdates, &contextUpdates)
		}
		if err := h.dispatcher.CompleteTask(ctx, req.Msg.TaskId, contextUpdates); err != nil {
			return nil, connect.NewError(connect.CodeInternal, err)
		}

	case workerv1.TaskStatus_TASK_STATUS_ERROR:
		errMsg := ""
		if req.Msg.Error != nil {
			errMsg = *req.Msg.Error
		}
		if err := h.dispatcher.FailTask(ctx, req.Msg.TaskId, errMsg); err != nil {
			return nil, connect.NewError(connect.CodeInternal, err)
		}

	default:
		return nil, connect.NewError(connect.CodeInvalidArgument, fmt.Errorf("invalid task status"))
	}

	return connect.NewResponse(&workerv1.SubmitTaskResultResponse{}), nil
}
```

- [ ] **Step 4: Run tests**

Run: `cd apps/controlplane && go test ./internal/api/ -v`
Expected: all 3 tests PASS

- [ ] **Step 5: Commit**

```bash
git add apps/controlplane/internal/api/ apps/controlplane/go.mod apps/controlplane/go.sum
git commit -m "feat(controlplane): add ConnectRPC WorkerService handler with auth"
```

---

### Task 11: Server entrypoint

**Files:**
- Modify: `apps/controlplane/cmd/server/main.go`

- [ ] **Step 1: Wire up the server**

```go
// apps/controlplane/cmd/server/main.go
package main

import (
	"fmt"
	"log"
	"net/http"
	"os"

	"github.com/adamgilman/fishplate/apps/controlplane/internal/api"
	"github.com/adamgilman/fishplate/apps/controlplane/internal/auth"
	"github.com/adamgilman/fishplate/apps/controlplane/internal/dispatcher"

	"fishplate/gen/go/fishplate/worker/v1/workerv1connect"
)

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	// TODO: replace with real Postgres implementations
	dispatcherDB := &stubDispatcherDB{}
	keyStore := &stubKeyStore{}

	d := dispatcher.New(dispatcherDB)
	a := auth.New(keyStore)
	workerHandler := api.NewWorkerHandler(d, a)

	mux := http.NewServeMux()
	path, handler := workerv1connect.NewWorkerServiceHandler(workerHandler)
	mux.Handle(path, handler)

	addr := fmt.Sprintf(":%s", port)
	log.Printf("fishplate control plane listening on %s", addr)
	if err := http.ListenAndServe(addr, mux); err != nil {
		log.Fatalf("server error: %v", err)
	}
}

// Stub implementations — replaced by Postgres in a follow-up task
type stubDispatcherDB struct{}

func (s *stubDispatcherDB) CreateTask(_ context.Context, _ *model.Task) error { return nil }
func (s *stubDispatcherDB) ClaimTask(_ context.Context, _, _ string) (*model.Task, error) {
	return nil, nil
}
func (s *stubDispatcherDB) CompleteTask(_ context.Context, _ string, _ map[string]any) error {
	return nil
}
func (s *stubDispatcherDB) FailTask(_ context.Context, _ string, _ string) error { return nil }

type stubKeyStore struct{}

func (s *stubKeyStore) GetTenantByKeyHash(_ context.Context, _ string) (string, error) {
	return "", nil
}
```

Note: The stub implementations will be replaced when wiring up Postgres in the orchestrator task. The imports need the correct packages — adjust as needed when the generated proto paths are finalized.

- [ ] **Step 2: Verify it builds**

Run: `cd apps/controlplane && go build ./cmd/server/`
Expected: builds without errors

- [ ] **Step 3: Commit**

```bash
git add apps/controlplane/cmd/server/main.go
git commit -m "feat(controlplane): wire up ConnectRPC server entrypoint"
```

---

## Chunk 4: Worker SDK

### Task 12: Scaffold the worker Go module

**Files:**
- Create: `apps/worker/go.mod`
- Create: `apps/worker/cmd/worker/main.go`

- [ ] **Step 1: Initialize Go module**

Run: `cd apps/worker && go mod init github.com/adamgilman/fishplate/apps/worker`

- [ ] **Step 2: Create placeholder main.go**

```go
// apps/worker/cmd/worker/main.go
package main

import "fmt"

func main() {
	fmt.Println("fishplate worker")
}
```

- [ ] **Step 3: Verify it builds**

Run: `cd apps/worker && go build ./cmd/worker/`
Expected: builds

- [ ] **Step 4: Commit**

```bash
git add apps/worker/
git commit -m "chore: scaffold worker Go module"
```

---

### Task 13: Worker SDK (Handle, Run, Config)

**Files:**
- Create: `apps/worker/pkg/worker/worker.go`
- Create: `apps/worker/pkg/worker/worker_test.go`

- [ ] **Step 1: Write failing tests**

```go
// apps/worker/pkg/worker/worker_test.go
package worker_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"

	"connectrpc.com/connect"
	workerv1 "fishplate/gen/go/fishplate/worker/v1"
	"fishplate/gen/go/fishplate/worker/v1/workerv1connect"

	"github.com/adamgilman/fishplate/apps/worker/pkg/worker"
)

// fakeWorkerService implements workerv1connect.WorkerServiceHandler for testing
type fakeWorkerService struct {
	tasks    []*workerv1.GetTaskResponse
	results  []*workerv1.SubmitTaskResultRequest
	taskIdx  int
}

func (f *fakeWorkerService) GetTask(_ context.Context, _ *connect.Request[workerv1.GetTaskRequest]) (*connect.Response[workerv1.GetTaskResponse], error) {
	if f.taskIdx < len(f.tasks) {
		resp := f.tasks[f.taskIdx]
		f.taskIdx++
		return connect.NewResponse(resp), nil
	}
	return connect.NewResponse(&workerv1.GetTaskResponse{}), nil
}

func (f *fakeWorkerService) SubmitTaskResult(_ context.Context, req *connect.Request[workerv1.SubmitTaskResultRequest]) (*connect.Response[workerv1.SubmitTaskResultResponse], error) {
	f.results = append(f.results, req.Msg)
	return connect.NewResponse(&workerv1.SubmitTaskResultResponse{}), nil
}

func TestWorker_HandlerRegistration(t *testing.T) {
	w := worker.New(worker.Config{
		ControlPlaneURL: "http://localhost:9999",
		APIKey:          "test",
		PollInterval:    time.Second,
	})

	called := false
	w.Handle("my_handler", func(input map[string]any) (map[string]any, error) {
		called = true
		return map[string]any{"done": true}, nil
	})

	if called {
		t.Fatal("handler should not be called on registration")
	}
}

func TestWorker_PollAndExecute(t *testing.T) {
	inputBytes, _ := json.Marshal(map[string]any{"x": 1})
	taskID := "task-1"
	handler := "echo_handler"

	svc := &fakeWorkerService{
		tasks: []*workerv1.GetTaskResponse{
			{TaskId: &taskID, Handler: &handler, Input: inputBytes},
		},
	}

	mux := http.NewServeMux()
	path, h := workerv1connect.NewWorkerServiceHandler(svc)
	mux.Handle(path, h)
	server := httptest.NewServer(mux)
	defer server.Close()

	var executed atomic.Bool
	w := worker.New(worker.Config{
		ControlPlaneURL: server.URL,
		APIKey:          "test",
		PollInterval:    50 * time.Millisecond,
	})
	w.Handle("echo_handler", func(input map[string]any) (map[string]any, error) {
		executed.Store(true)
		return map[string]any{"echoed": input["x"]}, nil
	})

	ctx, cancel := context.WithTimeout(context.Background(), 500*time.Millisecond)
	defer cancel()
	go w.Run(ctx)

	// Wait for execution
	time.Sleep(300 * time.Millisecond)

	if !executed.Load() {
		t.Fatal("handler was not executed")
	}
	if len(svc.results) == 0 {
		t.Fatal("expected SubmitTaskResult to be called")
	}
	if svc.results[0].Status != workerv1.TaskStatus_TASK_STATUS_SUCCESS {
		t.Fatalf("expected SUCCESS, got %v", svc.results[0].Status)
	}
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/worker && go test ./pkg/worker/`
Expected: FAIL

- [ ] **Step 3: Implement worker SDK**

```go
// apps/worker/pkg/worker/worker.go
package worker

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"time"

	"connectrpc.com/connect"
	workerv1 "fishplate/gen/go/fishplate/worker/v1"
	"fishplate/gen/go/fishplate/worker/v1/workerv1connect"

	"github.com/google/uuid"
)

// HandlerFunc is a function that handles a task. Receives evaluated input, returns context updates.
type HandlerFunc func(input map[string]any) (map[string]any, error)

// Config holds worker configuration.
type Config struct {
	ControlPlaneURL string
	APIKey          string
	TenantID        string
	WorkerID        string
	PollInterval    time.Duration
}

// Worker polls the control plane for tasks and executes registered handlers.
type Worker struct {
	config   Config
	handlers map[string]HandlerFunc
	client   workerv1connect.WorkerServiceClient
}

// New creates a new Worker with the given config.
func New(cfg Config) *Worker {
	if cfg.WorkerID == "" {
		cfg.WorkerID = uuid.New().String()
	}
	if cfg.PollInterval == 0 {
		cfg.PollInterval = time.Second
	}

	client := workerv1connect.NewWorkerServiceClient(
		http.DefaultClient,
		cfg.ControlPlaneURL,
		connect.WithInterceptors(&authInterceptor{key: cfg.APIKey}),
	)

	return &Worker{
		config:   cfg,
		handlers: make(map[string]HandlerFunc),
		client:   client,
	}
}

// Handle registers a handler function for the given name.
func (w *Worker) Handle(name string, fn HandlerFunc) {
	w.handlers[name] = fn
}

// Run starts the polling loop. Blocks until ctx is cancelled.
func (w *Worker) Run(ctx context.Context) {
	ticker := time.NewTicker(w.config.PollInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			w.poll(ctx)
		}
	}
}

func (w *Worker) poll(ctx context.Context) {
	resp, err := w.client.GetTask(ctx, connect.NewRequest(&workerv1.GetTaskRequest{
		WorkerId: w.config.WorkerID,
		TenantId: w.config.TenantID,
	}))
	if err != nil {
		log.Printf("GetTask error: %v", err)
		return
	}

	if resp.Msg.TaskId == nil {
		return // no work
	}

	taskID := *resp.Msg.TaskId
	handlerName := *resp.Msg.Handler

	var input map[string]any
	if resp.Msg.Input != nil {
		json.Unmarshal(resp.Msg.Input, &input)
	}

	handler, ok := w.handlers[handlerName]
	if !ok {
		log.Printf("no handler registered for %q, failing task %s", handlerName, taskID)
		errMsg := fmt.Sprintf("no handler registered for %q", handlerName)
		w.client.SubmitTaskResult(ctx, connect.NewRequest(&workerv1.SubmitTaskResultRequest{
			TaskId: taskID,
			Status: workerv1.TaskStatus_TASK_STATUS_ERROR,
			Error:  &errMsg,
		}))
		return
	}

	result, handlerErr := handler(input)
	if handlerErr != nil {
		errMsg := handlerErr.Error()
		w.client.SubmitTaskResult(ctx, connect.NewRequest(&workerv1.SubmitTaskResultRequest{
			TaskId: taskID,
			Status: workerv1.TaskStatus_TASK_STATUS_ERROR,
			Error:  &errMsg,
		}))
		return
	}

	contextUpdates, _ := json.Marshal(result)
	w.client.SubmitTaskResult(ctx, connect.NewRequest(&workerv1.SubmitTaskResultRequest{
		TaskId:         taskID,
		Status:         workerv1.TaskStatus_TASK_STATUS_SUCCESS,
		ContextUpdates: contextUpdates,
	}))
}

// authInterceptor adds the API key to outgoing requests.
type authInterceptor struct {
	key string
}

func (i *authInterceptor) WrapUnary(next connect.UnaryFunc) connect.UnaryFunc {
	return func(ctx context.Context, req connect.AnyRequest) (connect.AnyResponse, error) {
		req.Header().Set("Authorization", "Bearer "+i.key)
		return next(ctx, req)
	}
}

func (i *authInterceptor) WrapStreamingClient(next connect.StreamingClientFunc) connect.StreamingClientFunc {
	return next
}

func (i *authInterceptor) WrapStreamingHandler(next connect.StreamingHandlerFunc) connect.StreamingHandlerFunc {
	return next
}
```

- [ ] **Step 4: Add dependencies**

Run:
```bash
cd apps/worker
go get connectrpc.com/connect@latest
go get google.golang.org/protobuf@latest
go get github.com/google/uuid@latest
```

- [ ] **Step 5: Run tests**

Run: `cd apps/worker && go test ./pkg/worker/ -v`
Expected: all 2 tests PASS

- [ ] **Step 6: Commit**

```bash
git add apps/worker/
git commit -m "feat(worker): add worker SDK with handler registration and poll loop"
```

---

### Task 14: Worker entrypoint with example handler

**Files:**
- Modify: `apps/worker/cmd/worker/main.go`

- [ ] **Step 1: Write the example worker**

```go
// apps/worker/cmd/worker/main.go
package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"os/signal"
	"time"

	"github.com/adamgilman/fishplate/apps/worker/pkg/worker"
)

func main() {
	url := os.Getenv("FISHPLATE_URL")
	if url == "" {
		url = "http://localhost:8080"
	}
	apiKey := os.Getenv("FISHPLATE_API_KEY")
	tenantID := os.Getenv("FISHPLATE_TENANT_ID")

	w := worker.New(worker.Config{
		ControlPlaneURL: url,
		APIKey:          apiKey,
		TenantID:        tenantID,
		PollInterval:    time.Second,
	})

	// Example handlers — replace with real implementations
	w.Handle("llm_generate", func(input map[string]any) (map[string]any, error) {
		log.Printf("llm_generate called with: %v", input)
		return map[string]any{
			"generated_code": fmt.Sprintf("// generated for task: %v", input["task"]),
		}, nil
	})

	w.Handle("run_tests", func(input map[string]any) (map[string]any, error) {
		log.Printf("run_tests called with: %v", input)
		return map[string]any{
			"tests_passing": true,
			"coverage":      85,
		}, nil
	})

	w.Handle("deploy_service", func(input map[string]any) (map[string]any, error) {
		log.Printf("deploy_service called with: %v", input)
		return map[string]any{
			"deployed": true,
			"url":      "https://staging.example.com",
		}, nil
	})

	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt)
	defer cancel()

	log.Printf("fishplate worker starting (polling %s)", url)
	w.Run(ctx)
}
```

- [ ] **Step 2: Verify it builds**

Run: `cd apps/worker && go build ./cmd/worker/`
Expected: builds

- [ ] **Step 3: Commit**

```bash
git add apps/worker/cmd/worker/main.go
git commit -m "feat(worker): add entrypoint with example SDLC handlers"
```

---

## Chunk 5: Integration — Run All Tests

### Task 15: Verify all packages build and tests pass

- [ ] **Step 1: Run all controlplane tests**

Run: `cd apps/controlplane && go test ./... -v`
Expected: all tests PASS across cel, graph, dispatcher, auth, api packages

- [ ] **Step 2: Run all worker tests**

Run: `cd apps/worker && go test ./... -v`
Expected: all tests PASS

- [ ] **Step 3: Build both binaries**

Run:
```bash
cd apps/controlplane && go build -o ../../dist/controlplane ./cmd/server/
cd apps/worker && go build -o ../../dist/worker ./cmd/worker/
```
Expected: both binaries produced in `dist/`

- [ ] **Step 4: Final commit if any adjustments needed**

```bash
git add -A
git commit -m "chore: verify all tests pass and binaries build"
```
