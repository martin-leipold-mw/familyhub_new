#!/usr/bin/env bash
# PostToolUse-Hook (Stufe 1): schneller Per-Datei-Check auf der gerade
# geänderten Datei. Ziel: ESLint-Fehler landen sofort im Agent-Kontext,
# NICHT erst in der CI. Exit 2 blockiert und füttert stderr als Korrektur-
# signal an Claude zurück.
#
# Bewusst nur Frontend-TS/TSX via ESLint — das ist der einzige FAST-Check,
# der heute pro Datei existiert. Kotlin hat (noch) keinen schnellen Linter
# (kein ktlint/detekt konfiguriert) und wird vom Stop-Hook via Compile
# gefangen. tsc bleibt draußen, weil projektweit → gehört ebenfalls in den
# Stop-Hook. Faustregel: dieser Hook muss unter ein paar Sekunden bleiben.
set -uo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
file="$(jq -r '.tool_input.file_path // .tool_response.filePath // empty')"
[ -z "$file" ] && exit 0

case "$file" in
  # generierter Client wird regeneriert, nie von Hand gefixt → ignorieren
  *frontend/src/api/generated/*) exit 0 ;;
  *frontend/*.ts|*frontend/*.tsx)
    out="$(cd "$repo_root/frontend" && npx --no-install eslint --max-warnings 0 "$file" 2>&1)"
    if [ $? -ne 0 ]; then
      echo "ESLint-Fehler in ${file#"$repo_root"/} — bitte beheben, bevor du weitermachst:" >&2
      echo "$out" >&2
      exit 2
    fi
    ;;
esac
exit 0
