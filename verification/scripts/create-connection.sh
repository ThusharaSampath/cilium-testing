#!/bin/bash
set -e

cd "$(dirname "$0")/.."

if [ -z "$1" ] || [ -z "$2" ]; then
  echo "Usage: $0 <component-name> <component-url>"
  echo ""
  echo "Example:"
  echo "  $0 project-level-client https://consolev2.preview-dv.choreo.dev/organizations/thusharadev/projects/cilium-verification/components/client-pk"
  exit 1
fi

if [ ! -f auth/storage-state.json ]; then
  echo "Error: No auth state found. Run 'npm run login' first."
  exit 1
fi

echo "Creating connections for: $1"
COMPONENT_NAME="$1" COMPONENT_URL="$2" npx playwright test --project=create-connections
