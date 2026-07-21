# FamilyHub

Self-hosted family dashboard PWA. Runs on Synology NAS as Docker containers.

See [INSTALLATION.md](INSTALLATION.md) for setup instructions.

## Development

```bash
# Start database
docker-compose -f docker-compose.dev.yml up -d

# Backend (port 8081)
cd backend && ./gradlew bootRun

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
