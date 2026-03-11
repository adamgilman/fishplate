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

type fakeWorkerService struct {
	tasks   []*workerv1.GetTaskResponse
	results []*workerv1.SubmitTaskResultRequest
	taskIdx int
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
	handlerName := "echo_handler"

	svc := &fakeWorkerService{
		tasks: []*workerv1.GetTaskResponse{
			{TaskId: &taskID, Handler: &handlerName, Input: inputBytes},
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
