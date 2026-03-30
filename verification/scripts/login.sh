#!/bin/bash
set -e

cd "$(dirname "$0")/.."

echo "Opening browser for Google SSO login..."
echo "Complete the login in the browser window that opens."
echo ""

npx playwright test --project=auth-setup --headed
