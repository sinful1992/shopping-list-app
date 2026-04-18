#!/usr/bin/env bash
# Deletes all GitHub Actions workflow runs except the latest 10 per workflow.
# Usage: ./scripts/cleanup-builds.sh [owner/repo]
#
# Requires: gh CLI authenticated (gh auth login)

set -euo pipefail

REPO="${1:-sinful1992/shopping-list-app}"
KEEP=10

echo "Cleaning up workflow runs for $REPO (keeping latest $KEEP per workflow)..."

# Get all unique workflow IDs
workflow_ids=$(gh api "repos/$REPO/actions/workflows" --paginate -q '.workflows[].id')

for wf_id in $workflow_ids; do
  wf_name=$(gh api "repos/$REPO/actions/workflows/$wf_id" -q '.name')
  echo ""
  echo "Workflow: $wf_name (id=$wf_id)"

  # Fetch all run IDs for this workflow, newest first
  run_ids=$(gh api "repos/$REPO/actions/workflows/$wf_id/runs" \
    --paginate \
    -q '.workflow_runs[].id')

  total=$(echo "$run_ids" | grep -c . || true)
  echo "  Found $total runs"

  if [ "$total" -le "$KEEP" ]; then
    echo "  Nothing to delete (≤$KEEP runs)"
    continue
  fi

  to_delete=$(echo "$run_ids" | tail -n +"$((KEEP + 1))")
  count=$(echo "$to_delete" | grep -c . || true)
  echo "  Deleting $count runs..."

  while IFS= read -r run_id; do
    [ -z "$run_id" ] && continue
    gh api -X DELETE "repos/$REPO/actions/runs/$run_id" && echo "    Deleted run $run_id"
  done <<< "$to_delete"
done

echo ""
echo "Done."
