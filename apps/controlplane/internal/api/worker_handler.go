package api

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
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

func (h *WorkerHandler) authenticate(ctx context.Context, headers http.Header) (string, error) {
	authVal := headers.Get("Authorization")
	if authVal == "" {
		return "", connect.NewError(connect.CodeUnauthenticated, fmt.Errorf("missing Authorization header"))
	}
	token := strings.TrimPrefix(authVal, "Bearer ")
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
