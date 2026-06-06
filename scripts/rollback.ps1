<#
.SYNOPSIS
  Roll the backend (Supabase edge functions + Firebase RTDB rules) back to a
  known-good git ref and redeploy it. The "revert + redeploy" path from RUNBOOK
  §3, as one command.

.DESCRIPTION
  Checks the ref out into a throwaway git worktree (your current working tree and
  branch are never touched) and redeploys from there.

  Does NOT roll back database migrations — those are forward-only; undoing one is
  a deliberate, manual operation (see RUNBOOK §3). This script only redeploys code
  and rules, which is the safe, common case.

  Requires the Supabase CLI (SUPABASE_ACCESS_TOKEN set) and the Firebase CLI
  (GOOGLE_APPLICATION_CREDENTIALS pointing at a service-account JSON).

.PARAMETER Ref
  The git ref to roll back to (tag, branch, or commit), e.g. v1.22.4.

.PARAMETER FunctionsOnly
  Redeploy only the edge functions, not the RTDB rules.

.PARAMETER RulesOnly
  Redeploy only the RTDB rules, not the edge functions.

.PARAMETER Yes
  Skip the confirmation prompt.

.EXAMPLE
  ./scripts/rollback.ps1 -Ref v1.23.0
#>
param(
  [Parameter(Mandatory = $true)][string]$Ref,
  [string]$ProjectRef = "cwpzfsfjrlxekghfyqub",
  [string]$FirebaseProject = $env:FIREBASE_PROJECT_ID,
  [switch]$FunctionsOnly,
  [switch]$RulesOnly,
  [switch]$Yes
)

$ErrorActionPreference = "Stop"

# Resolve the ref to a concrete commit so the message is unambiguous.
$sha = (git rev-parse --short $Ref 2>$null)
if (-not $sha) { throw "Cannot resolve git ref '$Ref'." }

# Derive the function list from the TARGET ref, not a hard-coded list: rolling
# back to a ref that predates a function (e.g. health) must not try to deploy one
# absent from that tree — $ErrorActionPreference=Stop would abort the rollback.
$functions = @(git ls-tree -d --name-only "${Ref}:supabase/functions" 2>$null |
  Where-Object { $_ -and $_ -ne '_shared' })
if ($functions.Count -eq 0) { throw "No edge functions found in $Ref." }

Write-Host "Roll back backend to $Ref ($sha):" -ForegroundColor Yellow
if (-not $RulesOnly)     { Write-Host "  - redeploy edge functions: $($functions -join ', ')" }
if (-not $FunctionsOnly) { Write-Host "  - redeploy RTDB rules (firebase project: $FirebaseProject)" }
Write-Host "  - migrations are NOT touched (forward-only)" -ForegroundColor DarkGray

if (-not $Yes) {
  $ans = Read-Host "Proceed? (y/N)"
  if ($ans -ne 'y') { Write-Host "Aborted."; exit 0 }
}

$wt = Join-Path $env:TEMP ("rollback-" + [guid]::NewGuid().ToString('N').Substring(0, 8))
git worktree add --detach $wt $Ref | Out-Null
try {
  Push-Location $wt
  try {
    if (-not $RulesOnly) {
      supabase link --project-ref $ProjectRef
      foreach ($fn in $functions) {
        Write-Host "Deploying $fn ..." -ForegroundColor Cyan
        supabase functions deploy $fn --no-verify-jwt --project-ref $ProjectRef
      }
    }
    if (-not $FunctionsOnly) {
      if (-not $FirebaseProject) { throw "FirebaseProject not set (pass -FirebaseProject or set FIREBASE_PROJECT_ID)." }
      Write-Host "Deploying RTDB rules ..." -ForegroundColor Cyan
      firebase deploy --only database --project $FirebaseProject
    }
  } finally {
    Pop-Location
  }
} finally {
  git worktree remove $wt --force
}

Write-Host "Rollback to $Ref ($sha) complete. Verify with RUNBOOK §5." -ForegroundColor Green
