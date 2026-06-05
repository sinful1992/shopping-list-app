#!/usr/bin/env bash
# Roll the backend (Supabase edge functions + Firebase RTDB rules) back to a
# known-good git ref and redeploy it — the "revert + redeploy" path from
# RUNBOOK §3, as one command.
#
# Checks the ref out into a throwaway git worktree (your working tree and branch
# are never touched) and redeploys from there. Does NOT roll back database
# migrations (forward-only; undo is manual — see RUNBOOK §3).
#
# Requires the Supabase CLI (SUPABASE_ACCESS_TOKEN set) and the Firebase CLI
# (GOOGLE_APPLICATION_CREDENTIALS pointing at a service-account JSON).
#
# Usage: scripts/rollback.sh <git-ref> [--functions-only|--rules-only] [--yes]
set -euo pipefail

REF="${1:-}"
PROJECT_REF="${SUPABASE_PROJECT_ID:-cwpzfsfjrlxekghfyqub}"
FIREBASE_PROJECT="${FIREBASE_PROJECT_ID:-}"
FUNCTIONS_ONLY=0
RULES_ONLY=0
YES=0

if [ -z "$REF" ]; then echo "Usage: $0 <git-ref> [--functions-only|--rules-only] [--yes]"; exit 1; fi
shift || true
for arg in "$@"; do
  case "$arg" in
    --functions-only) FUNCTIONS_ONLY=1 ;;
    --rules-only) RULES_ONLY=1 ;;
    --yes) YES=1 ;;
  esac
done

FUNCTIONS=(notify-urgent-item revenuecat-webhook reconcile-subscription \
  register-device-token notify-shopping-started upsert-urgent-item health)

SHA="$(git rev-parse --short "$REF")" || { echo "Cannot resolve git ref '$REF'."; exit 1; }

echo "Roll back backend to $REF ($SHA):"
[ "$RULES_ONLY" -eq 0 ]     && echo "  - redeploy edge functions: ${FUNCTIONS[*]}"
[ "$FUNCTIONS_ONLY" -eq 0 ] && echo "  - redeploy RTDB rules (firebase project: $FIREBASE_PROJECT)"
echo "  - migrations are NOT touched (forward-only)"

if [ "$YES" -eq 0 ]; then
  read -r -p "Proceed? (y/N) " ans
  [ "$ans" = "y" ] || { echo "Aborted."; exit 0; }
fi

WT="${TMPDIR:-/tmp}/rollback-$(date +%s)"
git worktree add --detach "$WT" "$REF" >/dev/null
cleanup() { git worktree remove "$WT" --force >/dev/null 2>&1 || true; }
trap cleanup EXIT

pushd "$WT" >/dev/null
if [ "$RULES_ONLY" -eq 0 ]; then
  supabase link --project-ref "$PROJECT_REF"
  for fn in "${FUNCTIONS[@]}"; do
    echo "Deploying $fn ..."
    supabase functions deploy "$fn" --no-verify-jwt --project-ref "$PROJECT_REF"
  done
fi
if [ "$FUNCTIONS_ONLY" -eq 0 ]; then
  [ -n "$FIREBASE_PROJECT" ] || { echo "FIREBASE_PROJECT_ID not set."; exit 1; }
  echo "Deploying RTDB rules ..."
  firebase deploy --only database --project "$FIREBASE_PROJECT"
fi
popd >/dev/null

echo "Rollback to $REF ($SHA) complete. Verify with RUNBOOK §5."
