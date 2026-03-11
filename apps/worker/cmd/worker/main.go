package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"os/signal"
	"time"

	"github.com/adamgilman/fishplate/apps/worker/pkg/worker"
)

func main() {
	url := os.Getenv("FISHPLATE_URL")
	if url == "" {
		url = "http://localhost:8080"
	}
	apiKey := os.Getenv("FISHPLATE_API_KEY")
	tenantID := os.Getenv("FISHPLATE_TENANT_ID")

	w := worker.New(worker.Config{
		ControlPlaneURL: url,
		APIKey:          apiKey,
		TenantID:        tenantID,
		PollInterval:    time.Second,
	})

	w.Handle("llm_generate", func(input map[string]any) (map[string]any, error) {
		log.Printf("llm_generate called with: %v", input)
		return map[string]any{
			"generated_code": fmt.Sprintf("// generated for task: %v", input["task"]),
		}, nil
	})

	w.Handle("run_tests", func(input map[string]any) (map[string]any, error) {
		log.Printf("run_tests called with: %v", input)
		return map[string]any{
			"tests_passing": true,
			"coverage":      85,
		}, nil
	})

	w.Handle("deploy_service", func(input map[string]any) (map[string]any, error) {
		log.Printf("deploy_service called with: %v", input)
		return map[string]any{
			"deployed": true,
			"url":      "https://staging.example.com",
		}, nil
	})

	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt)
	defer cancel()

	log.Printf("fishplate worker starting (polling %s)", url)
	w.Run(ctx)
}
