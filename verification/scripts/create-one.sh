#!/bin/bash
set -e

cd "$(dirname "$0")/.."

if [ -z "$1" ]; then
  echo "Usage: $0 <component-name>"
  echo ""
  echo "Available components:"
  echo "  error-responder"
  echo "  org-service"
  echo "  project-service"
  echo "  public-service"
  echo "  proxy-service"
  echo "  project-level-server"
  echo "  project-level-client"
  exit 1
fi

if [ ! -f auth/storage-state.json ]; then
  echo "Error: No auth state found. Run 'npm run login' first."
  exit 1
fi

echo "Creating component: $1"
COMPONENT_NAME="$1" npx playwright test --project=create-components -g "$1"
