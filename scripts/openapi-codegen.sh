#!/usr/bin/env bash
# Fetch the FastAPI OpenAPI spec and generate a typed TS client.
# Requires the api service to be running on localhost:8000.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/packages/types/src/api-client/generated"
SPEC_URL="${API_OPENAPI_URL:-http://localhost:8000/openapi.json}"

echo "→ Fetching OpenAPI spec from $SPEC_URL"
mkdir -p "$OUT"
curl -fsSL "$SPEC_URL" -o "$OUT/openapi.json"

if command -v openapi-typescript >/dev/null 2>&1; then
  echo "→ Generating TS types via openapi-typescript"
  openapi-typescript "$OUT/openapi.json" -o "$OUT/types.ts"
elif command -v npx >/dev/null 2>&1; then
  echo "→ Generating TS types via npx openapi-typescript"
  npx -y openapi-typescript "$OUT/openapi.json" -o "$OUT/types.ts"
else
  echo "Note: install openapi-typescript globally or via npx to auto-generate types."
fi

echo "✓ OpenAPI artifacts written to $OUT"
