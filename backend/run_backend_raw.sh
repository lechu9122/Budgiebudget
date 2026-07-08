#!/usr/bin/env bash
set -euo pipefail

# Find the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(dirname "$SCRIPT_DIR")"
BACKEND="$SCRIPT_DIR"

cd "$BACKEND"

# Load .env in a CRLF-safe way for WSL shells. (also works on mac/linux)
if [ -f "$ROOT/.env" ]; then
    eval "$(tr -d '\r' < "$ROOT/.env" | sed -e '/^#/d' -e '/^$/d' -e 's/^/export /')"
fi

exec ./build/budgie_backend
