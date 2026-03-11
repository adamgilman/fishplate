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
