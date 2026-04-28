#!/bin/bash
set -e

cd "$(dirname "$0")/.."

echo "Installing dependencies..."
npm install

echo "Installing Chromium for Playwright..."
npx playwright install chromium

if [ ! -f .env ]; then
  cp .env.example .env
  echo ""
  echo "Created .env from template."
  echo "Edit verification/.env with your org/project values before running."
else
  echo ".env already exists — skipping copy."
fi

mkdir -p auth

echo ""
echo "Setup complete! Next steps:"
echo "  1. Edit .env with your Choreo org/project details"
echo "  2. Run: npm run login           (authenticate via Google SSO)"
echo "  3. Run: bash scripts/verify.sh  (full verification, interactive menu)"
