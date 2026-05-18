#!/bin/sh
# Run once after cloning: sh scripts/install-hooks.sh
cp scripts/pre-commit.sh .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit
echo "Git hooks installed."
