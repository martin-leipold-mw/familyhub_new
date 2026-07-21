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
