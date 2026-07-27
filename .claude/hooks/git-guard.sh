#!/usr/bin/env bash
# PreToolUse-Hook (Stufe 3, wasserdicht): blockt gefährliche git-Flags EGAL WO
# sie im Command stehen — auch mitten drin oder in Ketten (`... && git push -f`).
# Das schließt die Präfix-Lücke der Permission-Deny-Regeln, die nur den
# Command-ANFANG matchen. Exit 2 blockiert den Tool-Call; stderr geht an Claude.
#
# Geblockt:
#   --no-verify            (umgeht pre-commit/commit-msg-Hooks)
#   git commit -n          (Kurzform von --no-verify)
#   git push --force / -f   (überschreibt Remote-History)
# Erlaubt bleibt bewusst:
#   git push --force-with-lease   (die sichere Force-Variante)
set -uo pipefail

cmd="$(jq -r '.tool_input.command // empty')"
[ -z "$cmd" ] && exit 0
case "$cmd" in *git*) ;; *) exit 0 ;; esac

block() {
  echo "Blockiert vom git-Guard: $1" >&2
  echo "Command: $cmd" >&2
  echo "Falls beabsichtigt: ohne das Flag ausführen (bei force ggf. --force-with-lease)." >&2
  exit 2
}

# --no-verify irgendwo
if printf '%s' "$cmd" | grep -Eq -- '(^|[[:space:]])--no-verify([[:space:]]|=|$)'; then
  block "--no-verify umgeht die Commit-Hooks (Backpressure)."
fi

# git commit -n  (Kurzform von --no-verify)
if printf '%s' "$cmd" | grep -Eq 'git[[:space:]]+commit' \
   && printf '%s' "$cmd" | grep -Eq -- '(^|[[:space:]])-n([[:space:]]|$)'; then
  block "git commit -n ist die Kurzform von --no-verify."
fi

# git push --force / -f  — aber --force-with-lease erlauben
if printf '%s' "$cmd" | grep -Eq 'git[[:space:]]+push'; then
  if printf '%s' "$cmd" | grep -Eq -- '(^|[[:space:]])--force([[:space:]]|$)' \
     || printf '%s' "$cmd" | grep -Eq -- '(^|[[:space:]])-f([[:space:]]|$)'; then
    block "git push --force überschreibt Remote-History. Nutze --force-with-lease."
  fi
fi

exit 0
