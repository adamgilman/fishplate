package dispatcher

import (
	"context"
	"time"

	"github.com/adamgilman/fishplate/apps/controlplane/internal/model"
	"github.com/google/uuid"
)

// DB is the interface for task persistence.
type DB interface {
	CreateTask(ctx context.Context, task *model.Task) error
	ClaimTask(ctx context.Context, tenantID, workerID string) (*model.Task, error)
	CompleteTask(ctx context.Context, taskID string, result map[string]any) error
	FailTask(ctx context.Context, taskID string, errMsg string) error
}

type Dispatcher struct {
	db DB
}

func New(db DB) *Dispatcher {
	return &Dispatcher{db: db}
}

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

func (d *Dispatcher) ClaimTask(ctx context.Context, tenantID, workerID string) (*model.Task, error) {
	return d.db.ClaimTask(ctx, tenantID, workerID)
}

func (d *Dispatcher) CompleteTask(ctx context.Context, taskID string, result map[string]any) error {
	return d.db.CompleteTask(ctx, taskID, result)
}

func (d *Dispatcher) FailTask(ctx context.Context, taskID string, errMsg string) error {
	return d.db.FailTask(ctx, taskID, errMsg)
}
