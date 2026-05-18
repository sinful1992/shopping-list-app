#!/bin/sh
# Pre-commit: run service-layer unit tests before every commit.
# Fast — targets only src/services/__tests__. Full suite via: npm test
echo "Running pre-commit tests..."
npx jest "src/services/__tests__" "src/utils/__tests__" --no-coverage --silent
if [ $? -ne 0 ]; then
  echo "Tests failed. Commit blocked. Fix the failures and try again."
  exit 1
fi
