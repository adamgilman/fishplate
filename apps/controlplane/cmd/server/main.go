package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"

	"github.com/adamgilman/fishplate/apps/controlplane/internal/api"
	"github.com/adamgilman/fishplate/apps/controlplane/internal/auth"
	"github.com/adamgilman/fishplate/apps/controlplane/internal/dispatcher"
	"github.com/adamgilman/fishplate/apps/controlplane/internal/model"

	"fishplate/gen/go/fishplate/worker/v1/workerv1connect"
)

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	dispatcherDB := &stubDispatcherDB{}
	keyStore := &stubKeyStore{}

	d := dispatcher.New(dispatcherDB)
	a := auth.New(keyStore)
	workerHandler := api.NewWorkerHandler(d, a)

	mux := http.NewServeMux()
	path, handler := workerv1connect.NewWorkerServiceHandler(workerHandler)
	mux.Handle(path, handler)

	addr := fmt.Sprintf(":%s", port)
	log.Printf("fishplate control plane listening on %s", addr)
	if err := http.ListenAndServe(addr, mux); err != nil {
		log.Fatalf("server error: %v", err)
	}
}

type stubDispatcherDB struct{}

func (s *stubDispatcherDB) CreateTask(_ context.Context, _ *model.Task) error                    { return nil }
func (s *stubDispatcherDB) ClaimTask(_ context.Context, _, _ string) (*model.Task, error)        { return nil, nil }
func (s *stubDispatcherDB) CompleteTask(_ context.Context, _ string, _ map[string]any) error      { return nil }
func (s *stubDispatcherDB) FailTask(_ context.Context, _ string, _ string) error                  { return nil }

type stubKeyStore struct{}

func (s *stubKeyStore) GetTenantByKeyHash(_ context.Context, _ string) (string, error) { return "", nil }
