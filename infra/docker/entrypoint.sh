#!/bin/sh
set -eu

node --import tsx infra/docker/migrate.ts

# Reaper, Sweep, and summary fold pass their own command. Run that instead of
# the web server.
if [ "$#" -gt 0 ]; then
  exec "$@"
fi

# garage-init runs once per deploy and can keep a stale origin. Reapply CORS
# before serving uploads.
if [ -n "${GARAGE_ADMIN_TOKEN:-}" ] && [ -n "${BETTER_AUTH_URL:-}" ] && [ -n "${S3_BUCKET:-}" ]; then
  GARAGE_ADMIN_URL="${GARAGE_ADMIN_URL:-http://garage:3903}" \
    CORS_ORIGINS="$BETTER_AUTH_URL" \
    /bin/sh infra/docker/garage-cors.sh
fi

if [ -f dist/server/server.js ]; then
  entry=dist/server/server.js
elif [ -f dist/server/index.js ]; then
  entry=dist/server/index.js
else
  echo "TanStack Start server bundle not found in dist/server/" >&2
  ls -la dist/server >&2 || true
  exit 1
fi

# srvx resolves --static from the server entry directory unless --dir is set,
# which turns "dist/client" into "dist/server/dist/client".
exec ./node_modules/.bin/srvx --prod --host 0.0.0.0 --port "${PORT:-3000}" --dir . --entry "$entry" -s dist/client
