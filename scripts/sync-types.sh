#!/usr/bin/env bash
# Sync Supabase-generated types from geoerp web repo to geoerp-mobile.
# Run this after any migration change in geoerp.
#
# Usage: ./scripts/sync-types.sh [path-to-geoerp-repo]
#
# If no path given, clones a sparse checkout into a temp directory.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
MOBILE_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TARGET="$MOBILE_ROOT/types/database.generated.ts"

GEOERP_REPO="${1:-}"
TEMP_DIR=""

if [ -n "$GEOERP_REPO" ]; then
  SOURCE="$GEOERP_REPO/packages/supabase/src/database.types.ts"
  if [ ! -f "$SOURCE" ]; then
    echo "Error: $SOURCE not found" >&2
    exit 1
  fi
else
  echo "No local geoerp path provided. Doing sparse checkout..."
  TEMP_DIR="$(mktemp -d)"
  trap 'rm -rf "$TEMP_DIR"' EXIT

  git clone --depth 1 --filter=blob:none --sparse \
    https://github.com/Techingenius/geoerp.git "$TEMP_DIR/geoerp" 2>/dev/null

  cd "$TEMP_DIR/geoerp"
  git sparse-checkout set packages/supabase/src/database.types.ts
  cd "$MOBILE_ROOT"

  SOURCE="$TEMP_DIR/geoerp/packages/supabase/src/database.types.ts"
  if [ ! -f "$SOURCE" ]; then
    echo "Error: Could not fetch database.types.ts from geoerp repo" >&2
    exit 1
  fi
fi

cp "$SOURCE" "$TARGET"
echo "Synced: $TARGET"
echo "Don't forget to commit the updated file."
