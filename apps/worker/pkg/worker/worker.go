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

type HandlerFunc func(input map[string]any) (map[string]any, error)

type Config struct {
	ControlPlaneURL string
	APIKey          string
	TenantID        string
	WorkerID        string
	PollInterval    time.Duration
}

type Worker struct {
	config   Config
	handlers map[string]HandlerFunc
	client   workerv1connect.WorkerServiceClient
}

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

func (w *Worker) Handle(name string, fn HandlerFunc) {
	w.handlers[name] = fn
}

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
		return
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
