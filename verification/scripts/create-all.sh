#!/bin/bash
set -e

cd "$(dirname "$0")/.."

if [ ! -f auth/storage-state.json ]; then
  echo "Error: No auth state found. Run 'npm run login' first."
  exit 1
fi

echo "Creating all components in Choreo..."
npx playwright test --project=create-components
