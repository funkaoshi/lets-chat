#!/usr/bin/env bash
# First-run helper for the Docker dev flow.
#
# - Creates docker/.env from docker/.env.example if missing.
# - Auto-generates LCB_SECRETS_COOKIE if the line is blank (the app
#   refuses to boot without it; see app.js).
# - Idempotent: safe to re-run. Existing values are never overwritten.
#
# Usage:
#   ./docker/bootstrap.sh
#   docker compose -f docker/docker-compose.yml -f docker/docker-compose.dev.yml up
#
# Or in one shot:
#   ./docker/bootstrap.sh && \
#     docker compose -f docker/docker-compose.yml -f docker/docker-compose.dev.yml up

set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$DIR/.env"
ENV_EXAMPLE="$DIR/.env.example"

if [[ ! -f "$ENV_FILE" ]]; then
    if [[ ! -f "$ENV_EXAMPLE" ]]; then
        echo "error: $ENV_EXAMPLE missing -- nothing to copy from" >&2
        exit 1
    fi
    cp "$ENV_EXAMPLE" "$ENV_FILE"
    echo "Created $ENV_FILE from .env.example."
fi

# Fill in LCB_SECRETS_COOKIE if the line exists but has no value.
if grep -qE '^LCB_SECRETS_COOKIE=\s*$' "$ENV_FILE"; then
    if ! command -v openssl >/dev/null 2>&1; then
        echo "error: openssl is required to generate a cookie secret" >&2
        exit 1
    fi
    SECRET=$(openssl rand -hex 32)
    # Use a tmp file to avoid sed -i portability between GNU/BSD.
    awk -v s="$SECRET" '
        /^LCB_SECRETS_COOKIE=\s*$/ { print "LCB_SECRETS_COOKIE=" s; next }
        { print }
    ' "$ENV_FILE" > "$ENV_FILE.tmp"
    mv "$ENV_FILE.tmp" "$ENV_FILE"
    echo "Generated LCB_SECRETS_COOKIE in $ENV_FILE."
fi

# Friendly nudge if Giphy isn't configured -- not fatal.
if grep -qE '^LCB_GIPHY_API_KEY=\s*$' "$ENV_FILE"; then
    echo "note: LCB_GIPHY_API_KEY is blank. Giphy search will hit a banned demo key."
    echo "      Get a free key at https://developers.giphy.com and add it to $ENV_FILE."
fi

echo "Ready. Start the dev stack with:"
echo "  docker compose -f docker/docker-compose.yml -f docker/docker-compose.dev.yml up"
