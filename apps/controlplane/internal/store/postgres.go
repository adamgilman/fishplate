package store

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/adamgilman/fishplate/apps/controlplane/internal/model"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Store struct {
	pool *pgxpool.Pool
}

func New(ctx context.Context, databaseURL string) (*Store, error) {
	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		return nil, fmt.Errorf("connect to database: %w", err)
	}
	if err := pool.Ping(ctx); err != nil {
		return nil, fmt.Errorf("ping database: %w", err)
	}
	return &Store{pool: pool}, nil
}

func (s *Store) Close() {
	s.pool.Close()
}

func (s *Store) CreateTask(ctx context.Context, task *model.Task) error {
	inputJSON, err := json.Marshal(task.Input)
	if err != nil {
		return fmt.Errorf("marshal input: %w", err)
	}
	_, err = s.pool.Exec(ctx,
		`INSERT INTO tasks (id, tenant_id, execution_id, node_id, handler, input, status, deadline, created_at)
		 VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6::jsonb, $7, $8, $9)`,
		task.ID, task.TenantID, task.ExecutionID, task.NodeID, task.Handler,
		string(inputJSON), string(task.Status), task.Deadline, task.CreatedAt,
	)
	return err
}

func (s *Store) ClaimTask(ctx context.Context, tenantID, workerID string) (*model.Task, error) {
	row := s.pool.QueryRow(ctx,
		`UPDATE tasks
		 SET status = 'claimed', worker_id = $2, claimed_at = now()
		 WHERE id = (
		   SELECT id FROM tasks
		   WHERE tenant_id = $1::uuid AND status = 'pending'
		   ORDER BY created_at
		   LIMIT 1
		   FOR UPDATE SKIP LOCKED
		 )
		 RETURNING id, tenant_id, execution_id, node_id, handler, input, status, worker_id, deadline, created_at, claimed_at`,
		tenantID, workerID,
	)

	t := &model.Task{}
	var inputJSON []byte
	var statusStr string
	err := row.Scan(
		&t.ID, &t.TenantID, &t.ExecutionID, &t.NodeID, &t.Handler,
		&inputJSON, &statusStr, &t.WorkerID, &t.Deadline, &t.CreatedAt, &t.ClaimedAt,
	)
	if err == pgx.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	t.Status = model.TaskStatus(statusStr)
	if inputJSON != nil {
		json.Unmarshal(inputJSON, &t.Input)
	}
	return t, nil
}

func (s *Store) CompleteTask(ctx context.Context, taskID string, result map[string]any) error {
	resultJSON, err := json.Marshal(result)
	if err != nil {
		return fmt.Errorf("marshal result: %w", err)
	}
	_, err = s.pool.Exec(ctx,
		`UPDATE tasks SET status = 'completed', result = $2::jsonb, completed_at = now()
		 WHERE id = $1::uuid AND status = 'claimed'`,
		taskID, string(resultJSON),
	)
	return err
}

func (s *Store) FailTask(ctx context.Context, taskID string, errMsg string) error {
	_, err := s.pool.Exec(ctx,
		`UPDATE tasks SET status = 'failed', error = $2, completed_at = now()
		 WHERE id = $1::uuid AND status = 'claimed'`,
		taskID, errMsg,
	)
	return err
}

func (s *Store) GetTenantByKeyHash(ctx context.Context, keyHash string) (string, error) {
	var tenantID string
	err := s.pool.QueryRow(ctx,
		`SELECT tenant_id FROM api_keys WHERE key_hash = $1 AND revoked_at IS NULL`,
		keyHash,
	).Scan(&tenantID)
	if err == pgx.ErrNoRows {
		return "", nil
	}
	return tenantID, err
}
