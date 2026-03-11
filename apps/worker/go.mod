module github.com/adamgilman/fishplate/apps/worker

go 1.24.0

replace fishplate/gen/go => ../../libs/proto/gen/go

require (
	connectrpc.com/connect v1.19.1
	fishplate/gen/go v0.0.0-00010101000000-000000000000
	github.com/google/uuid v1.6.0
)

require google.golang.org/protobuf v1.36.11 // indirect
