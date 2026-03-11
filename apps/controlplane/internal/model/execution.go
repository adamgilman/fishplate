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
