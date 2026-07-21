#!/usr/bin/env bash
set -euo pipefail

echo "▶ Backend: Tests + Coverage-Verifikation"
cd "$(git rev-parse --show-toplevel)/backend"
./gradlew check --daemon
cd ..

echo "▶ Frontend: Type-Check + Lint + Coverage"
cd "$(git rev-parse --show-toplevel)/frontend"
npm run check
cd ..

echo "✓ Alle Prüfungen bestanden — Commit wird fortgesetzt"
