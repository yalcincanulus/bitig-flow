#!/bin/sh
# Apply bucket CORS through Garage's admin API. The Garage image has no shell,
# and its CLI has no CORS command. CORS_ORIGINS is a comma-separated list.
set -eu

admin_url="${GARAGE_ADMIN_URL:-http://garage:3903}"
bucket="${S3_BUCKET:?S3_BUCKET is required}"
token="${GARAGE_ADMIN_TOKEN:?GARAGE_ADMIN_TOKEN is required}"
origins="${CORS_ORIGINS:?CORS_ORIGINS is required}"

info=""
attempt=0
while [ "$attempt" -lt 30 ]; do
  if info=$(wget -qO- --header="Authorization: Bearer ${token}" \
    "${admin_url}/v2/GetBucketInfo?globalAlias=${bucket}" 2>/dev/null); then
    break
  fi
  attempt=$((attempt + 1))
  sleep 1
  info=""
done

if [ -z "$info" ]; then
  echo "Garage bucket ${bucket} was not available at ${admin_url}" >&2
  exit 1
fi

id=$(printf '%s' "$info" | sed -n 's/.*"id"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')
if [ -z "$id" ]; then
  echo "Garage did not return a bucket id for ${bucket}" >&2
  exit 1
fi

# Coolify stores the container port on the domain (https://app.example:3000).
# Browsers omit the default port, so the preflight Origin is https://app.example.
collected=""
append_origin() {
  candidate=$1
  if [ -z "$candidate" ]; then
    return
  fi
  case $candidate in
    *\"* | *\\*)
      echo "CORS origin must not contain a quote or backslash" >&2
      exit 1
      ;;
  esac
  case ",$collected," in
    *,"$candidate",*) return ;;
  esac
  if [ -z "$collected" ]; then
    collected=$candidate
  else
    collected=$collected,$candidate
  fi
}

rest=$origins
while [ -n "$rest" ]; do
  origin=${rest%%,*}
  case $rest in
    *,*) rest=${rest#*,} ;;
    *) rest="" ;;
  esac
  origin=$(printf '%s' "$origin" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//;s:/*$::')
  append_origin "$origin"
  without_port=$(printf '%s' "$origin" | sed 's#^\(https://[^/:]*\):[0-9][0-9]*$#\1#;s#^\(http://[^/:]*\):[0-9][0-9]*$#\1#')
  if [ "$without_port" != "$origin" ]; then
    append_origin "$without_port"
  fi
done

rules=""
rest=$collected
while [ -n "$rest" ]; do
  origin=${rest%%,*}
  case $rest in
    *,*) rest=${rest#*,} ;;
    *) rest="" ;;
  esac
  rule=$(printf '{"AllowedOrigin":["%s"],"AllowedMethod":["GET","PUT","HEAD"],"AllowedHeader":["*"],"ExposeHeader":["ETag"],"MaxAgeSeconds":3000}' "$origin")
  if [ -z "$rules" ]; then
    rules=$rule
  else
    rules=$rules,$rule
  fi
done

if [ -z "$rules" ]; then
  echo "CORS_ORIGINS did not contain an origin" >&2
  exit 1
fi

body=$(printf '{"corsRules":[%s]}' "$rules")
if ! wget -qO /tmp/garage-cors-body \
  --header="Authorization: Bearer ${token}" \
  --header="Content-Type: application/json" \
  --post-data="$body" \
  "${admin_url}/v2/UpdateBucket?id=${id}"; then
  echo "Garage UpdateBucket failed for ${bucket}" >&2
  exit 1
fi

echo "Set CORS on Garage bucket ${bucket}"
