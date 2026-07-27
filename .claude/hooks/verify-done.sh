#!/usr/bin/env bash
# Stop-Hook (Stufe 2): erzwungene Definition-of-Done — BEWUSST SCHLANK.
# Nur Compile / Type-Check, KEINE Testcontainers, KEINE Coverage-Gate.
# Grund: `./gradlew check` startet Docker-Postgres (Testcontainers) und muss
# die 100-%-Branch-Coverage-Hürde nehmen — das wäre Minuten pro Turn plus
# Flake-Risiko und würde die Loop unbrauchbar machen. Tests + Coverage bleiben
# Aufgabe der CI, wo sie einmal pro PR wehtun statt einmal pro Turn.
#
# Was dieser Hook garantiert: kein Agent-Turn endet mit rotem *Compile*.
# Exit 2 blockiert das Beenden und zwingt Claude, erst grün zu machen.
set -uo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
fail=0
msgs=""

# Frontend: Type-Check (schnell, kein Docker). Nur wenn Deps installiert sind.
if [ -d "$repo_root/frontend/node_modules" ]; then
  if ! out="$(cd "$repo_root/frontend" && npx --no-install tsc --noEmit 2>&1)"; then
    fail=1
    msgs="$msgs"$'\n'"── tsc --noEmit ──"$'\n'"$out"
  fi
fi

# Backend: nur Main- + Test-Sources kompilieren (keine Testausführung, kein Docker).
# Braucht Java 21 (siehe JAVA_HOME in /etc/sandbox-persistent.sh).
if [ -x "$repo_root/backend/gradlew" ]; then
  if ! out="$(cd "$repo_root/backend" && ./gradlew --quiet compileKotlin compileTestKotlin 2>&1)"; then
    fail=1
    msgs="$msgs"$'\n'"── gradlew compileKotlin compileTestKotlin ──"$'\n'"$out"
  fi
fi

if [ "$fail" -ne 0 ]; then
  echo "Verifikation fehlgeschlagen — vor dem Beenden beheben:$msgs" >&2
  exit 2
fi
exit 0
