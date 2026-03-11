# Docker Dev Stack

Development environment for fishplate using Docker Compose.

## Services

| Service | Image | Port | Description |
|---------|-------|------|-------------|
| `postgres` | postgres:16 | 5433 | Database with migrations auto-applied |
| `controlplane` | go.Dockerfile + Air | 8080 | Control plane with live reload |
| `worker` | go.Dockerfile + Air | — | Worker with live reload |

## Common Commands

```bash
# Start everything
docker compose up --build

# Start just Postgres (for running Go locally)
docker compose up postgres -d

# View logs
docker compose logs -f controlplane
docker compose logs -f worker

# Reset database (wipe and re-seed)
docker compose down -v && docker compose up --build

# Connect to Postgres directly
docker compose exec postgres psql -U fishplate

# Check task status
docker compose exec postgres psql -U fishplate -c "SELECT handler, status FROM tasks;"
```

## Live Reload

Both Go services use [Air](https://github.com/air-verse/air) for live reload. Edit any `.go` file and Air will rebuild and restart the service automatically.

## Demo Credentials

| Key | Value |
|-----|-------|
| API Key | `fp_demo_key` |
| Tenant ID | `00000000-0000-0000-0000-000000000001` |
| DB User | `fishplate` |
| DB Password | `fishplate` |
| DB Name | `fishplate` |
