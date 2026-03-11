package store

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/adamgilman/fishplate/apps/controlplane/internal/model"
	"github.com/google/uuid"
)

const (
	testTenantID    = "00000000-0000-0000-0000-000000000001"
	testExecutionID = "00000000-0000-0000-0000-000000001000"
)

func testStore(t *testing.T) *Store {
	t.Helper()
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		t.Skip("DATABASE_URL not set, skipping integration test")
	}
	s, err := New(context.Background(), dbURL)
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	t.Cleanup(s.Close)
	return s
}

func createTestTask(t *testing.T, s *Store, handler string) *model.Task {
	t.Helper()
	task := &model.Task{
		ID:          uuid.New().String(),
		TenantID:    testTenantID,
		ExecutionID: testExecutionID,
		NodeID:      "test-" + handler,
		Handler:     handler,
		Input:       map[string]any{"key": "value"},
		Status:      model.TaskPending,
		Deadline:    time.Now().Add(5 * time.Minute),
		CreatedAt:   time.Now(),
	}
	if err := s.CreateTask(context.Background(), task); err != nil {
		t.Fatalf("CreateTask: %v", err)
	}
	return task
}

func TestCreateAndClaimTask(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()

	// Drain any existing pending tasks for the test tenant first
	for {
		claimed, _ := s.ClaimTask(ctx, testTenantID, "drain-worker")
		if claimed == nil {
			break
		}
		s.CompleteTask(ctx, claimed.ID, nil)
	}

	task := createTestTask(t, s, "test_create_claim")

	claimed, err := s.ClaimTask(ctx, testTenantID, "worker-1")
	if err != nil {
		t.Fatalf("ClaimTask: %v", err)
	}
	if claimed == nil {
		t.Fatal("ClaimTask returned nil, expected a task")
	}
	if claimed.ID != task.ID {
		t.Errorf("claimed task ID = %s, want %s", claimed.ID, task.ID)
	}
	if claimed.Handler != "test_create_claim" {
		t.Errorf("handler = %s, want test_create_claim", claimed.Handler)
	}
	if claimed.Input["key"] != "value" {
		t.Errorf("input[key] = %v, want value", claimed.Input["key"])
	}
	if claimed.Status != model.TaskClaimed {
		t.Errorf("status = %s, want claimed", claimed.Status)
	}

	// Clean up
	s.CompleteTask(ctx, claimed.ID, nil)
}

func TestClaimTaskReturnsNilWhenEmpty(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()

	claimed, err := s.ClaimTask(ctx, "00000000-0000-0000-0000-ffffffffffff", "worker-1")
	if err != nil {
		t.Fatalf("ClaimTask: %v", err)
	}
	if claimed != nil {
		t.Errorf("expected nil, got task %s", claimed.ID)
	}
}

func TestCompleteTask(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()

	task := createTestTask(t, s, "test_complete")
	claimed, err := s.ClaimTask(ctx, testTenantID, "worker-1")
	if err != nil || claimed == nil {
		t.Fatalf("ClaimTask: err=%v claimed=%v", err, claimed)
	}

	err = s.CompleteTask(ctx, claimed.ID, map[string]any{"result": "ok"})
	if err != nil {
		t.Fatalf("CompleteTask: %v", err)
	}
	_ = task
}

func TestFailTask(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()

	createTestTask(t, s, "test_fail")
	claimed, err := s.ClaimTask(ctx, testTenantID, "worker-1")
	if err != nil || claimed == nil {
		t.Fatalf("ClaimTask: err=%v claimed=%v", err, claimed)
	}

	err = s.FailTask(ctx, claimed.ID, "something broke")
	if err != nil {
		t.Fatalf("FailTask: %v", err)
	}
}

func TestGetTenantByKeyHash(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()

	hash := "57110c62de6ce26e3bcd67f495f59243722c7bd35920e211cc5b1279debd638a"
	tenantID, err := s.GetTenantByKeyHash(ctx, hash)
	if err != nil {
		t.Fatalf("GetTenantByKeyHash: %v", err)
	}
	if tenantID != testTenantID {
		t.Errorf("tenantID = %s, want %s", tenantID, testTenantID)
	}
}

func TestGetTenantByKeyHashNotFound(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()

	tenantID, err := s.GetTenantByKeyHash(ctx, "nonexistent_hash")
	if err != nil {
		t.Fatalf("GetTenantByKeyHash: %v", err)
	}
	if tenantID != "" {
		t.Errorf("expected empty string, got %s", tenantID)
	}
}
