package api_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"connectrpc.com/connect"
	"github.com/adamgilman/fishplate/apps/controlplane/internal/api"
	"github.com/adamgilman/fishplate/apps/controlplane/internal/auth"
	"github.com/adamgilman/fishplate/apps/controlplane/internal/dispatcher"
	"github.com/adamgilman/fishplate/apps/controlplane/internal/model"
	workerv1 "fishplate/gen/go/fishplate/worker/v1"
	"fishplate/gen/go/fishplate/worker/v1/workerv1connect"
)

// --- mock dispatcher DB ---

type mockDB struct {
	tasks []*model.Task
}

func (m *mockDB) CreateTask(_ context.Context, t *model.Task) error {
	m.tasks = append(m.tasks, t)
	return nil
}

func (m *mockDB) ClaimTask(_ context.Context, tenantID, workerID string) (*model.Task, error) {
	for _, t := range m.tasks {
		if t.TenantID == tenantID && t.Status == model.TaskPending {
			t.Status = model.TaskClaimed
			t.WorkerID = workerID
			return t, nil
		}
	}
	return nil, nil
}

func (m *mockDB) CompleteTask(_ context.Context, taskID string, result map[string]any) error {
	for _, t := range m.tasks {
		if t.ID == taskID {
			t.Status = model.TaskCompleted
			t.Result = result
		}
	}
	return nil
}

func (m *mockDB) FailTask(_ context.Context, taskID string, errMsg string) error {
	for _, t := range m.tasks {
		if t.ID == taskID {
			t.Status = model.TaskFailed
			t.Error = errMsg
		}
	}
	return nil
}

// --- mock key store ---

type mockKeyStore struct {
	keys map[string]string // keyHash -> tenantID
}

func (m *mockKeyStore) GetTenantByKeyHash(_ context.Context, keyHash string) (string, error) {
	return m.keys[keyHash], nil
}

// --- helpers ---

const testAPIKey = "test-api-key-12345"
const testTenantID = "tenant-abc"

func setupTest(db *mockDB) (workerv1connect.WorkerServiceClient, *httptest.Server) {
	ks := &mockKeyStore{
		keys: map[string]string{
			auth.HashKey(testAPIKey): testTenantID,
		},
	}

	d := dispatcher.New(db)
	a := auth.New(ks)
	handler := api.NewWorkerHandler(d, a)

	mux := http.NewServeMux()
	path, h := workerv1connect.NewWorkerServiceHandler(handler)
	mux.Handle(path, h)

	srv := httptest.NewServer(mux)

	client := workerv1connect.NewWorkerServiceClient(
		srv.Client(),
		srv.URL,
		connect.WithInterceptors(authInterceptor{key: testAPIKey}),
	)

	return client, srv
}

type authInterceptor struct {
	key string
}

func (a authInterceptor) WrapUnary(next connect.UnaryFunc) connect.UnaryFunc {
	return func(ctx context.Context, req connect.AnyRequest) (connect.AnyResponse, error) {
		if a.key != "" {
			req.Header().Set("Authorization", "Bearer "+a.key)
		}
		return next(ctx, req)
	}
}

func (a authInterceptor) WrapStreamingClient(next connect.StreamingClientFunc) connect.StreamingClientFunc {
	return next
}

func (a authInterceptor) WrapStreamingHandler(next connect.StreamingHandlerFunc) connect.StreamingHandlerFunc {
	return next
}

// --- tests ---

func TestGetTask_NoWork(t *testing.T) {
	db := &mockDB{}
	client, srv := setupTest(db)
	defer srv.Close()

	resp, err := client.GetTask(context.Background(), connect.NewRequest(&workerv1.GetTaskRequest{
		TenantId: testTenantID,
		WorkerId: "worker-1",
	}))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if resp.Msg.TaskId != nil {
		t.Fatalf("expected nil TaskId, got %v", *resp.Msg.TaskId)
	}
}

func TestGetTask_WithWork(t *testing.T) {
	db := &mockDB{
		tasks: []*model.Task{
			{
				ID:       "task-123",
				TenantID: testTenantID,
				Handler:  "send_email",
				Input:    map[string]any{"to": "user@example.com"},
				Status:   model.TaskPending,
			},
		},
	}
	client, srv := setupTest(db)
	defer srv.Close()

	resp, err := client.GetTask(context.Background(), connect.NewRequest(&workerv1.GetTaskRequest{
		TenantId: testTenantID,
		WorkerId: "worker-1",
	}))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if resp.Msg.TaskId == nil || *resp.Msg.TaskId != "task-123" {
		t.Fatalf("expected task_id=task-123, got %v", resp.Msg.TaskId)
	}
	if resp.Msg.Handler == nil || *resp.Msg.Handler != "send_email" {
		t.Fatalf("expected handler=send_email, got %v", resp.Msg.Handler)
	}
	if resp.Msg.Input == nil {
		t.Fatal("expected non-nil input")
	}
}

func TestGetTask_BadAuth(t *testing.T) {
	db := &mockDB{}
	ks := &mockKeyStore{
		keys: map[string]string{
			auth.HashKey(testAPIKey): testTenantID,
		},
	}

	d := dispatcher.New(db)
	a := auth.New(ks)
	handler := api.NewWorkerHandler(d, a)

	mux := http.NewServeMux()
	path, h := workerv1connect.NewWorkerServiceHandler(handler)
	mux.Handle(path, h)

	srv := httptest.NewServer(mux)
	defer srv.Close()

	// Client with bad API key
	client := workerv1connect.NewWorkerServiceClient(
		srv.Client(),
		srv.URL,
		connect.WithInterceptors(authInterceptor{key: "bad-key"}),
	)

	_, err := client.GetTask(context.Background(), connect.NewRequest(&workerv1.GetTaskRequest{
		TenantId: testTenantID,
		WorkerId: "worker-1",
	}))
	if err == nil {
		t.Fatal("expected error, got nil")
	}
	if connectErr, ok := err.(*connect.Error); ok {
		if connectErr.Code() != connect.CodeUnauthenticated {
			t.Fatalf("expected Unauthenticated, got %v", connectErr.Code())
		}
	} else {
		t.Fatalf("expected connect.Error, got %T", err)
	}
}
