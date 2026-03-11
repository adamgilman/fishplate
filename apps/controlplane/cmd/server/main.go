package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"

	"connectrpc.com/grpcreflect"
	"github.com/adamgilman/fishplate/apps/controlplane/internal/api"
	"github.com/adamgilman/fishplate/apps/controlplane/internal/auth"
	"github.com/adamgilman/fishplate/apps/controlplane/internal/dispatcher"
	"github.com/adamgilman/fishplate/apps/controlplane/internal/store"
	"golang.org/x/net/http2"
	"golang.org/x/net/http2/h2c"

	"fishplate/gen/go/fishplate/worker/v1/workerv1connect"
)

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	host := os.Getenv("HOST")
	if host == "" {
		host = "0.0.0.0"
	}
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		log.Fatal("DATABASE_URL is required")
	}

	ctx := context.Background()
	s, err := store.New(ctx, dbURL)
	if err != nil {
		log.Fatalf("failed to connect to database: %v", err)
	}
	defer s.Close()

	d := dispatcher.New(s)
	a := auth.New(s)
	workerHandler := api.NewWorkerHandler(d, a)

	mux := http.NewServeMux()
	path, handler := workerv1connect.NewWorkerServiceHandler(workerHandler)
	mux.Handle(path, handler)

	reflector := grpcreflect.NewStaticReflector(workerv1connect.WorkerServiceName)
	mux.Handle(grpcreflect.NewHandlerV1(reflector))
	mux.Handle(grpcreflect.NewHandlerV1Alpha(reflector))

	addr := fmt.Sprintf("%s:%s", host, port)
	log.Printf("fishplate control plane listening on %s", addr)

	h2cHandler := h2c.NewHandler(mux, &http2.Server{})
	if err := http.ListenAndServe(addr, h2cHandler); err != nil {
		log.Fatalf("server error: %v", err)
	}
}
