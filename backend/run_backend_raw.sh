#!/usr/bin/env bash
set -euo pipefail

ROOT="/mnt/c/Users/lechu/Documents/CanvasProject/ass4-335/Budgiebudget"
BACKEND="$ROOT/backend"

cd "$BACKEND"

# Load .env in a CRLF-safe way for WSL shells.
eval "$(tr -d '\r' < "$ROOT/.env" | sed -e '/^#/d' -e '/^$/d' -e 's/^/export /')"

exec ./build/budgie_backend
