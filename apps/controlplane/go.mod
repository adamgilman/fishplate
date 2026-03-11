module github.com/adamgilman/fishplate/apps/controlplane

go 1.25.0

require (
	connectrpc.com/connect v1.19.1
	connectrpc.com/grpcreflect v1.3.0
	fishplate/gen/go v0.0.0
	github.com/google/cel-go v0.27.0
	github.com/google/uuid v1.6.0
	golang.org/x/net v0.40.0
)

require (
	cel.dev/expr v0.25.1 // indirect
	github.com/antlr4-go/antlr/v4 v4.13.1 // indirect
	github.com/jackc/pgpassfile v1.0.0 // indirect
	github.com/jackc/pgservicefile v0.0.0-20240606120523-5a60cdf6a761 // indirect
	github.com/jackc/pgx/v5 v5.8.0 // indirect
	github.com/jackc/puddle/v2 v2.2.2 // indirect
	golang.org/x/exp v0.0.0-20240823005443-9b4947da3948 // indirect
	golang.org/x/sync v0.17.0 // indirect
	golang.org/x/text v0.29.0 // indirect
	google.golang.org/genproto/googleapis/api v0.0.0-20240826202546-f6391c0de4c7 // indirect
	google.golang.org/genproto/googleapis/rpc v0.0.0-20240826202546-f6391c0de4c7 // indirect
	google.golang.org/protobuf v1.36.11 // indirect
)

replace fishplate/gen/go => ../../libs/proto/gen/go
