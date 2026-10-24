#!/usr/bin/env bash
# Sync Supabase-generated types from geoerp web repo to geoerp-mobile.
# Run this after any migration change in geoerp.
#
# Usage: ./scripts/sync-types.sh [path-to-geoerp-repo]
#
# If no path given, clones a sparse checkout into a temp directory.
#
# GEOERP_REF picks the branch to read from (default `main`). Schema that is
# still on an integration branch is not on main yet: GRA-829 needed
# `GEOERP_REF=wave-integration` for the segment/activity RPCs.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
MOBILE_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TARGET="$MOBILE_ROOT/types/database.generated.ts"

GEOERP_REPO="${1:-}"
GEOERP_REF="${GEOERP_REF:-main}"
TEMP_DIR=""

if [ -n "$GEOERP_REPO" ]; then
  SOURCE="$GEOERP_REPO/packages/supabase/src/database.types.ts"
  if [ ! -f "$SOURCE" ]; then
    echo "Error: $SOURCE not found" >&2
    exit 1
  fi
else
  echo "No local geoerp path provided. Doing sparse checkout of $GEOERP_REF..."
  TEMP_DIR="$(mktemp -d)"
  trap 'rm -rf "$TEMP_DIR"' EXIT

  git clone --depth 1 --filter=blob:none --sparse --branch "$GEOERP_REF" \
    https://github.com/Techingenius/geoerp.git "$TEMP_DIR/geoerp" 2>/dev/null

  cd "$TEMP_DIR/geoerp"
  # --skip-checks: the path is a file, not a directory.
  git sparse-checkout set --skip-checks packages/supabase/src/database.types.ts
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
