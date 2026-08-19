#!/bin/sh
# Pre-commit gate. Install with: cp scripts/pre-commit.sh .git/hooks/pre-commit
#
# This file is the source of truth for the hook. It had drifted badly — the
# installed hook carried the version and changelog checks while this copy was
# still the original nine-line test runner, so a fresh clone got none of it.
#
# --runInBand: avoids "worker force-exited" noise from WatermelonDB's async LokiJS init
# --forceExit: cleans up after WatermelonDB holds the event loop open post-test

STAGED=$(git diff --cached --name-only)

# --- Version check ---
PACKAGE_STAGED=$(echo "$STAGED" | grep -c '^package\.json$')
SRC_STAGED=$(echo "$STAGED" | grep -cE '^(src/|supabase/|android/|ios/)')

if [ "$PACKAGE_STAGED" -gt 0 ]; then
  # package.json is staged — validate the version was actually incremented
  NEW_VERSION=$(git diff --cached -- package.json | grep '^+"version"' | grep -oE '[0-9]+\.[0-9]+\.[0-9]+')
  OLD_VERSION=$(git show HEAD:package.json 2>/dev/null | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).version))" 2>/dev/null)

  if [ -n "$NEW_VERSION" ] && [ -n "$OLD_VERSION" ]; then
    if [ "$NEW_VERSION" = "$OLD_VERSION" ]; then
      echo "ERROR: package.json staged but version is still $OLD_VERSION — bump it before committing."
      exit 1
    fi

    NEW_MAJOR=$(echo "$NEW_VERSION" | cut -d. -f1)
    NEW_MINOR=$(echo "$NEW_VERSION" | cut -d. -f2)
    NEW_PATCH=$(echo "$NEW_VERSION" | cut -d. -f3)
    OLD_MAJOR=$(echo "$OLD_VERSION" | cut -d. -f1)
    OLD_MINOR=$(echo "$OLD_VERSION" | cut -d. -f2)
    OLD_PATCH=$(echo "$OLD_VERSION" | cut -d. -f3)

    IS_GREATER=0
    if [ "$NEW_MAJOR" -gt "$OLD_MAJOR" ]; then IS_GREATER=1
    elif [ "$NEW_MAJOR" -eq "$OLD_MAJOR" ] && [ "$NEW_MINOR" -gt "$OLD_MINOR" ]; then IS_GREATER=1
    elif [ "$NEW_MAJOR" -eq "$OLD_MAJOR" ] && [ "$NEW_MINOR" -eq "$OLD_MINOR" ] && [ "$NEW_PATCH" -gt "$OLD_PATCH" ]; then IS_GREATER=1
    fi

    if [ "$IS_GREATER" -eq 0 ]; then
      echo "ERROR: Version went backwards: $OLD_VERSION -> $NEW_VERSION"
      exit 1
    fi

    echo "Version: $OLD_VERSION -> $NEW_VERSION"
  fi

  # --- Changelog check ---
  # A version bump is a release — CHANGELOG.md must be updated alongside it.
  CHANGELOG_STAGED=$(echo "$STAGED" | grep -c '^CHANGELOG\.md$')
  if [ "$CHANGELOG_STAGED" -eq 0 ]; then
    echo "ERROR: package.json version bumped but CHANGELOG.md not updated."
    echo "Add an entry under [Unreleased] (or the new version heading) and stage CHANGELOG.md."
    exit 1
  fi
elif [ "$SRC_STAGED" -gt 0 ]; then
  # Source files changed but version not bumped — block
  CURRENT_VERSION=$(node -p "require('./package.json').version" 2>/dev/null)
  echo "ERROR: Source files changed but version not bumped (currently $CURRENT_VERSION)."
  echo "Bump the version in package.json before committing."
  exit 1
fi

# --- Encoding check ---
# Cheap, so it runs before the suite. Catches U+FFFD, which no other gate here
# can see: tsc, eslint and knip all treat a replacement character as valid text.
node scripts/check-encoding.js
if [ $? -ne 0 ]; then
  echo "Commit blocked: fix the encoding damage above."
  exit 1
fi

# --- Tests ---
echo "Running pre-commit tests (full suite)..."
npx jest --no-coverage --silent --runInBand --forceExit
if [ $? -ne 0 ]; then
  echo "Tests failed. Commit blocked. Fix the failures and try again."
  exit 1
fi
