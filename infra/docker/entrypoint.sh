#!/bin/sh
set -eu

node --import tsx infra/docker/migrate.ts

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
