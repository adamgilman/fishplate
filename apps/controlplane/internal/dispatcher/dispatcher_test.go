package dispatcher

import (
	"context"
	"sync"
	"testing"
	"time"

	"github.com/adamgilman/fishplate/apps/controlplane/internal/model"
)

// mockDB is an in-memory implementation of the DB interface for testing.
type mockDB struct {
	mu    sync.Mutex
	tasks map[string]*model.Task
}

func newMockDB() *mockDB {
	return &mockDB{tasks: make(map[string]*model.Task)}
}

func (m *mockDB) CreateTask(_ context.Context, task *model.Task) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.tasks[task.ID] = task
	return nil
}

func (m *mockDB) ClaimTask(_ context.Context, tenantID, workerID string) (*model.Task, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
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

func (m *mockDB) CompleteTask(_ context.Context, taskID string, result map[string]any) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	t, ok := m.tasks[taskID]
	if !ok {
		return nil
	}
	t.Status = model.TaskCompleted
	t.Result = result
	now := time.Now()
	t.CompletedAt = &now
	return nil
}

func (m *mockDB) FailTask(_ context.Context, taskID string, errMsg string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	t, ok := m.tasks[taskID]
	if !ok {
		return nil
	}
	t.Status = model.TaskFailed
	t.Error = errMsg
	now := time.Now()
	t.CompletedAt = &now
	return nil
}

func TestCreateAndClaim(t *testing.T) {
	db := newMockDB()
	d := New(db)
	ctx := context.Background()

	taskID, err := d.CreateTask(ctx, "tenant-1", "exec-1", "node-1", "send_email", map[string]any{"to": "a@b.com"}, 5*time.Minute)
	if err != nil {
		t.Fatalf("CreateTask: %v", err)
	}
	if taskID == "" {
		t.Fatal("expected non-empty task ID")
	}

	claimed, err := d.ClaimTask(ctx, "tenant-1", "worker-1")
	if err != nil {
		t.Fatalf("ClaimTask: %v", err)
	}
	if claimed == nil {
		t.Fatal("expected a claimed task, got nil")
	}
	if claimed.Handler != "send_email" {
		t.Errorf("expected handler send_email, got %s", claimed.Handler)
	}
	if claimed.Status != model.TaskClaimed {
		t.Errorf("expected status claimed, got %s", claimed.Status)
	}
}

func TestClaimEmpty(t *testing.T) {
	db := newMockDB()
	d := New(db)
	ctx := context.Background()

	claimed, err := d.ClaimTask(ctx, "tenant-1", "worker-1")
	if err != nil {
		t.Fatalf("ClaimTask: %v", err)
	}
	if claimed != nil {
		t.Fatalf("expected nil task, got %+v", claimed)
	}
}

func TestCompleteTask(t *testing.T) {
	db := newMockDB()
	d := New(db)
	ctx := context.Background()

	taskID, err := d.CreateTask(ctx, "tenant-1", "exec-1", "node-1", "handler", nil, 5*time.Minute)
	if err != nil {
		t.Fatalf("CreateTask: %v", err)
	}

	_, err = d.ClaimTask(ctx, "tenant-1", "worker-1")
	if err != nil {
		t.Fatalf("ClaimTask: %v", err)
	}

	err = d.CompleteTask(ctx, taskID, map[string]any{"ok": true})
	if err != nil {
		t.Fatalf("CompleteTask: %v", err)
	}

	task := db.tasks[taskID]
	if task.Status != model.TaskCompleted {
		t.Errorf("expected status completed, got %s", task.Status)
	}
	if task.Result["ok"] != true {
		t.Errorf("expected result ok=true, got %v", task.Result)
	}
}

func TestFailTask(t *testing.T) {
	db := newMockDB()
	d := New(db)
	ctx := context.Background()

	taskID, err := d.CreateTask(ctx, "tenant-1", "exec-1", "node-1", "handler", nil, 5*time.Minute)
	if err != nil {
		t.Fatalf("CreateTask: %v", err)
	}

	_, err = d.ClaimTask(ctx, "tenant-1", "worker-1")
	if err != nil {
		t.Fatalf("ClaimTask: %v", err)
	}

	err = d.FailTask(ctx, taskID, "timeout exceeded")
	if err != nil {
		t.Fatalf("FailTask: %v", err)
	}

	task := db.tasks[taskID]
	if task.Status != model.TaskFailed {
		t.Errorf("expected status failed, got %s", task.Status)
	}
	if task.Error != "timeout exceeded" {
		t.Errorf("expected error 'timeout exceeded', got %s", task.Error)
	}
}
