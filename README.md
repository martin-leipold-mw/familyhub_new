# FamilyHub

Self-hosted family dashboard PWA. Runs on Synology NAS as Docker containers.

See [INSTALLATION.md](INSTALLATION.md) for setup instructions.

## Development

```bash
# Start database
docker-compose -f docker-compose.dev.yml up -d
```



# Backend (port 8081)
```bash
# FAMILYHUB_ENCRYPTION_KEY is required — the app refuses to start without a
# real key (must be at least 32 characters and not the CHANGE_ME placeholder).
# Generate one once and export it (e.g. add it to your shell profile or a .env):
export FAMILYHUB_ENCRYPTION_KEY="$(openssl rand -base64 32)"
```
```bash
cd backend && ./gradlew bootRun
```

> The backend connects to Postgres on `localhost:5433` (the `docker-compose.dev.yml`
> service above), so start the database first. Flyway applies the schema
> migrations automatically on startup. Verify it's up with
> `curl http://localhost:8081/api/health` → `{"status":"UP"}`.

```bash
# Frontend (port 8080)
cd frontend && npm run dev
```

## Pre-Commit Hook

To enforce the full quality gate (backend coverage + frontend type-check/lint/coverage) before every commit, install the pre-commit hook once:

```bash
cp scripts/pre-commit-check.sh .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit
```

The hook runs `./gradlew check` in the backend and `npm run check` in the frontend. E2E tests (Playwright) run only in CI, not in the pre-commit hook.
