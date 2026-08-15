# Garage as a local S3 backend (Docker)

Research for [#2](https://github.com/veotaar/bitig-flow/issues/2). Scope: single-node Garage in docker compose for local development, and whether Garage's S3 API covers the access patterns this app already committed to.

Standing constraints (not reopened): one bucket; object keys `org/<orgId>/doc/<docId>/<file>`; presigned PUT for browser upload; ~60s presigned GET after a gate; local infra is docker compose; Coolify/production is out of scope.

Pinned version used as the source of truth: **Garage v2.3.0** (the version the official docs currently show in Docker examples). Code citations are from tag `v2.3.0` on the upstream forge (`git.deuxfleurs.fr/Deuxfleurs/garage`). Docs citations are from `https://garagehq.deuxfleurs.fr/` unless noted.

---

## Verdict

Garage can be the local S3 stand-in. Pin `dxflrs/garage:v2.3.0` (or later), run `garage server --single-node --default-bucket`, persist meta/data volumes, and configure `@aws-sdk/client-s3` with `endpoint: http://127.0.0.1:3900`, `region: "garage"`, `forcePathStyle: true`. Presigned PUT and GET are implemented and tested upstream. CORS is a first-class S3 API (`PutBucketCors`) and is **not** created by `--default-bucket` — add it as a one-shot init after the node is up. Checksums are implemented in v2.3.0 for CRC32/CRC32C/CRC64NVME/SHA1/SHA256, but browser presigned PUT still needs checksums disabled on the **presigning** client so the URL does not sign headers the browser will not send.

---

## 1. Single-node Docker / compose shape

### Image

Official image: `dxflrs/garage` on Docker Hub. Docs tell you to pin a version, not `latest`. The cookbook and quick start currently use `dxflrs/garage:v2.3.0`.

- [Quick Start](https://garagehq.deuxfleurs.fr/documentation/quick-start/)
- [Deployment on a cluster](https://garagehq.deuxfleurs.fr/documentation/cookbook/real-world/)
- [Docker Hub: dxflrs/garage](https://hub.docker.com/r/dxflrs/garage)

### Ports

Default binds from the quick-start `garage.toml`:

| Role | Config key | Default bind | Host map (local) |
| --- | --- | --- | --- |
| S3 API | `[s3_api].api_bind_addr` | `[::]:3900` | `3900:3900` |
| RPC (cluster) | `rpc_bind_addr` | `[::]:3901` | `3901:3901` (needed even for one node) |
| Website | `[s3_web].bind_addr` | `[::]:3902` | optional; **not required** for private-bucket PUT/GET |
| Admin | `[admin].api_bind_addr` | `[::]:3903` | `3903:3903` (health + admin API) |

The S3 API does not speak TLS. TLS is a reverse-proxy concern.

- [Configuration file format — `[s3_api]`](https://garagehq.deuxfleurs.fr/documentation/reference-manual/configuration/)
- [Quick Start](https://garagehq.deuxfleurs.fr/documentation/quick-start/)

### Volumes

Quick start's `docker run` example **does not** persist data. Docs say you must add volumes for `metadata_dir` and `data_dir` and point `garage.toml` at them.

Cluster cookbook convention:

- config: `/etc/garage.toml`
- metadata: `/var/lib/garage/meta` (prefer SSD)
- data: `/var/lib/garage/data`

- [Quick Start — Docker note](https://garagehq.deuxfleurs.fr/documentation/quick-start/)
- [Deployment on a cluster](https://garagehq.deuxfleurs.fr/documentation/cookbook/real-world/)

### `garage.toml` for local single-node

Shape from the quick start (secrets generated once and reused):

```toml
metadata_dir = "/var/lib/garage/meta"
data_dir = "/var/lib/garage/data"
db_engine = "sqlite"          # quick start; cluster cookbook uses lmdb
replication_factor = 1        # required for --single-node

rpc_bind_addr = "[::]:3901"
rpc_public_addr = "127.0.0.1:3901"
rpc_secret = "<32-byte hex>"  # openssl rand -hex 32

[s3_api]
s3_region = "garage"
api_bind_addr = "[::]:3900"
root_domain = ".s3.garage.localhost"

[s3_web]
bind_addr = "[::]:3902"
root_domain = ".web.garage.localhost"
index = "index.html"

[admin]
api_bind_addr = "[::]:3903"
admin_token = "<base64>"
metrics_token = "<base64>"
```

`--single-node` **requires** `replication_factor = 1`. If it is anything else, the process exits with an error.

- [Quick Start — generating a first configuration file](https://garagehq.deuxfleurs.fr/documentation/quick-start/)
- [Configuration — `replication_factor`](https://garagehq.deuxfleurs.fr/documentation/reference-manual/configuration/)
- Source: `src/garage/server.rs` at tag `v2.3.0` (`"Single-node mode requires replication_factor = 1"`)

`replication_factor = 1` is documented as test-only: no redundancy.

### Official compose vs local compose

The cluster cookbook's `docker-compose.yml` uses `network_mode: "host"` because nodes must reach each other. That is the wrong default for a laptop single-node. Use the quick-start `docker run` pattern instead: published ports, no host network.

```yaml
# illustrative — not implemented in this ticket
services:
  garage:
    image: dxflrs/garage:v2.3.0
    command: ["/garage", "server", "--single-node", "--default-bucket"]
    ports:
      - "3900:3900"
      - "3901:3901"
      - "3903:3903"
    environment:
      GARAGE_DEFAULT_ACCESS_KEY: "${GARAGE_DEFAULT_ACCESS_KEY}"
      GARAGE_DEFAULT_SECRET_KEY: "${GARAGE_DEFAULT_SECRET_KEY}"
      GARAGE_DEFAULT_BUCKET: "${GARAGE_DEFAULT_BUCKET:-bitig}"
    volumes:
      - ./infra/garage.toml:/etc/garage.toml:ro
      - garage-meta:/var/lib/garage/meta
      - garage-data:/var/lib/garage/data
```

The image default command is `garage server` **without** `--single-node`. If you omit the command override, layout stays unassigned (`NO ROLE ASSIGNED`) and the S3 API will not serve a usable cluster.

- [Deployment on a cluster — docker-compose.yml](https://garagehq.deuxfleurs.fr/documentation/cookbook/real-world/)
- [Quick Start — Docker `docker run … /garage server --single-node --default-bucket`](https://garagehq.deuxfleurs.fr/documentation/quick-start/)

---

## 2. Layout initialization (and making `compose up` idempotent)

Without a layout, `garage status` shows `NO ROLE ASSIGNED`. Objects cannot be stored until a layout is assigned **and applied**.

### Manual sequence (pre-v2.3.0, or if you skip the flags)

1. Start the daemon.
2. `garage status` → copy node id prefix.
3. `garage layout assign -z dc1 -c 1G <node_id>`
4. `garage layout apply --version 1`

Capacity is ignored for a true single-node layout; zone is a label.

`layout assign` only **stages** changes. `layout apply` computes partition assignment and bumps the version. The new version number must be exactly `1 + current`. Calling `apply` twice with the same `--version` can create two different layouts with the same version and break the cluster.

- [Quick Start — Creating a cluster layout](https://garagehq.deuxfleurs.fr/documentation/quick-start/)
- [Cluster layout management](https://garagehq.deuxfleurs.fr/documentation/operations/layout/)

### Automatic sequence (v2.3.0+): `--single-node`

`garage server --single-node` does the assign+apply internally.

From `src/garage/server.rs` (`initial_config`) at `v2.3.0`:

- Requires `replication_factor = 1`.
- Reads current layout version:
  - **0**: stages this node as zone `dc1`, tag `default`, capacity = available data disk (or 1 GiB), applies as version **1**.
  - **1**: no-op (already initialized). Idempotent restart.
  - **> 1**: refuses to start (`Remove the --single-node flag`).
- Refuses if any **other** node is already known.

That is the mechanism that makes a fresh clone + `docker compose up` work **without** a sidecar that races `garage status`.

### Default bucket + key (v2.3.0+)

`--default-bucket` / `--default-access-key` are **only** valid together with `--single-node`.

Environment:

- `GARAGE_DEFAULT_ACCESS_KEY` — docs example: `GK$(openssl rand -hex 16)`
- `GARAGE_DEFAULT_SECRET_KEY` — docs example: `$(openssl rand -hex 32)`
- `GARAGE_DEFAULT_BUCKET`

`--default-bucket` implies creating the access key as well (the env vars are required either way).

Idempotence on restart (`initial_config`):

- If the access key id already exists with the **same** secret: reuse.
- If it exists with a **different** secret: **error** (do not rotate the secret in `.env` against an existing volume).
- If it was deleted: **error** (cannot re-import).
- If the bucket name already exists: reuse.
- Permissions are (re)applied every start: read, write, **owner**.

CORS is **not** part of this path.

- [Quick Start — Configuring initial access credentials / Launching](https://garagehq.deuxfleurs.fr/documentation/quick-start/)
- Source: `src/garage/server.rs` `initial_config` at tag `v2.3.0`
- Release notes: “Make initial setup easier (#1329)” on [Forge releases](https://git.deuxfleurs.fr/Deuxfleurs/garage/releases)

### Scripting layout without the flags

If you ever script `layout assign` / `layout apply` yourself:

- Talk to **one** RPC host for all CLI/admin calls (staged changes propagate asynchronously).
- Call `apply` **once**, strictly after all `assign`/`remove` calls have returned.
- Never reuse `--version`.

Admin equivalents: `UpdateClusterLayout` then `ApplyClusterLayout` (`POST /v2/…`).

- [Cluster layout management — scripting warnings](https://garagehq.deuxfleurs.fr/documentation/operations/layout/)
- [Admin API v2](https://garagehq.deuxfleurs.fr/api/garage-admin-v2.html)

---

## 3. Bucket and access-key provisioning

Both the CLI and the admin API are scriptable. For compose, prefer the v2.3.0 flags above so keys are stable across `up`.

### CLI (inside the container)

```bash
docker exec <container> /garage status
docker exec <container> /garage bucket create <name>
docker exec <container> /garage key create <name>
docker exec <container> /garage bucket allow --read --write --owner <bucket> --key <name>
```

`garage key create` prints the Key ID + secret **once**. Keys are independent of buckets; permissions are attached with `bucket allow`.

CLI needs the config file (`/etc/garage.toml` in the image) and metadata dir; in Docker that is already true inside the container.

- [Quick Start — Creating buckets and keys](https://garagehq.deuxfleurs.fr/documentation/quick-start/)

### Admin API (HTTP)

Bind `[admin].api_bind_addr`, authenticate with `Authorization: Bearer <token>`.

Relevant v2 operations: `CreateKey`, `CreateBucket`, `AllowBucketKey`, `GetClusterStatus`, `UpdateClusterLayout`, `ApplyClusterLayout`.

`ImportKey` exists for migrations/backup restore. The OpenAPI text says: **do not use it to generate custom key identifiers or you will break your cluster**. The `--default-access-key` path **does** import a chosen id+secret via `Key::import`; that is the supported way to pin credentials for local env files. Do not invent arbitrary ids via `ImportKey` in scripts.

Since v2.0.0, `garage json-api <Operation> '{…}'` invokes the same admin operations over RPC **without** an HTTP bearer token. Useful from `docker exec`.

- [Administration API](https://garagehq.deuxfleurs.fr/documentation/reference-manual/admin-api/)
- [Admin API v2 — CreateKey / ImportKey](https://garagehq.deuxfleurs.fr/api/garage-admin-v2.html)

### CORS is not a `garage` CLI command

Bucket CORS is the S3 API: `PutBucketCors` / `GetBucketCors` / `DeleteBucketCors`. Official app recipes use `aws s3api put-bucket-cors`. The key must have **owner** on the bucket (`OWNER_PUT "/?cors"` in the S3 router). `--default-bucket` already grants owner.

- [S3 compatibility — PutBucketCors](https://garagehq.deuxfleurs.fr/reference_manual/s3_compatibility.html)
- [Apps — Ente CORS](https://garagehq.deuxfleurs.fr/documentation/connect/apps/)
- Source: `src/api/s3/router.rs` at tag `v2.3.0`

---

## 4. Presigned PUT (browser upload)

**Supported.** Garage implements SigV4 query-string auth and ships an integration test that:

1. Builds a `PutObject` presigned URL via the AWS Rust SDK (`PresigningConfig`, `expires_in`).
2. `PUT`s the body to that URI with **no extra signed headers**.
3. Expects HTTP 200 and an ETag.

- Source: `src/garage/tests/s3/presigned.rs` at tag `v2.3.0`
- Signature path: `src/api/common/signature/payload.rs` `check_presigned_signature`

### SigV4 details that differ from (or are stricter than) “just AWS”

From `payload.rs` at `v2.3.0`:

- Presigned URLs are detected first (query `X-Amz-Algorithm`).
- `X-Amz-Expires` is **required** and must be a number. **Maximum is 7 days** (`7 * 24 * 3600`). A 60s GET is well inside the limit.
- Presigned requests are treated as **`UNSIGNED-PAYLOAD`**. The server does not re-hash the body against `x-amz-content-sha256` for presigned URLs.
- Signed headers must include `Host` and used `x-amz-*` headers (except `x-amz-content-sha256`).
- If a signed query parameter and a signed header of the same name disagree, the request is rejected (AWS spec).
- Header-auth path **does not require** `Content-Type` to be in `SignedHeaders` (explicit MinIO compatibility). That relaxation is for the Authorization-header path, not a promise that a presigned URL which **did** sign `content-type` will accept a PUT that omits it.

Reverse proxies that canonicalize the path break presigned URLs. Apache needs `ProxyPass … nocanon`. Nginx examples pass `$http_host` through.

- [Configuring a reverse proxy](https://garagehq.deuxfleurs.fr/documentation/cookbook/reverse-proxy/)
- Source: `src/api/common/signature/payload.rs` at tag `v2.3.0`

### App implication for browser PUT

Generate the URL on the server with `@aws-sdk/s3-request-presigner` against the Garage-configured `S3Client`. The browser should `PUT` the file bytes to that URL.

If you sign `Content-Type` into the URL, the browser **must** send the same `Content-Type`. If you sign checksum headers, the browser must send those too (see §8). Simplest: presign with checksums off and only the headers you will actually send (`content-type` if you care about stored MIME).

Official first-party example of “clients PUT directly to Garage”: Ente + ejabberd `mod_s3_upload` in [Apps](https://garagehq.deuxfleurs.fr/documentation/connect/apps/).

---

## 5. Presigned GET with a short TTL

**Supported.** Same test file covers `GetObject` `.presigned(psc)` then `GET` the URI.

`X-Amz-Expires` is the TTL in seconds. 60 is valid. Upper bound 604800.

There is no Garage-specific “max TTL” knob in `garage.toml`; expiry is purely SigV4.

---

## 6. CORS for browser PUT

Two different things:

1. **Website endpoint** (port 3902): Garage documents “CORS headers on web endpoint” as a global S3 feature. That is for public website buckets, not the private-object flow.
2. **S3 API** (port 3900): `PutBucketCors` stores rules on the bucket. The S3 API server matches them on `OPTIONS` (preflight) and, on success, attaches CORS headers to the actual response.

`api_server.rs` at `v2.3.0`: `Endpoint::Options` → `find_matching_cors_rule`; after a successful request, `add_cors_headers`.

Official Ente recipe (browser GET **and** PUT/POST/DELETE):

```bash
export CORS='{"CORSRules":[{"AllowedHeaders":["*"],"AllowedMethods":["GET", "PUT", "POST", "DELETE"],"AllowedOrigins":["*"], "ExposeHeaders":["ETag"]}]}'
aws s3api put-bucket-cors --bucket ente --cors-configuration $CORS
```

They also require `--owner` on the key “for the CORS setup to work, at least temporarily.”

For bitig-flow: `AllowedOrigins` should be the Vite origin (e.g. `http://localhost:3000`), `AllowedMethods` at least `GET, PUT, HEAD, OPTIONS`, `AllowedHeaders` include `*` or at least `Content-Type` (and checksum headers if you keep them), `ExposeHeaders: ["ETag"]` so the browser can read the ETag after PUT.

This step is **not** idempotent via `--default-bucket`. Add a compose init that waits for `/health` on 3903, then `put-bucket-cors`. Repeating `PutBucketCors` overwrites the config (normal S3 replace semantics).

- [S3 compatibility](https://garagehq.deuxfleurs.fr/reference_manual/s3_compatibility.html)
- [Apps — Peertube / Ente](https://garagehq.deuxfleurs.fr/documentation/connect/apps/)
- Source: `src/api/s3/api_server.rs`, `src/api/s3/cors.rs` at tag `v2.3.0`

---

## 7. Path-style vs virtual-host-style

**Path-style is always on.** Virtual-host-style is optional and needs `[s3_api].root_domain` plus wildcard DNS (and TLS in production).

- Path-style: `http://127.0.0.1:3900/<bucket>/<key>`
- Vhost-style: `http://<bucket><root_domain>/<key>` e.g. `http://bitig.s3.garage.localhost/…` if `root_domain = ".s3.garage.localhost"`

Hand `@aws-sdk/client-s3` the **path-style** endpoint `http://127.0.0.1:3900` and set `forcePathStyle: true`. Do not use `http://bitig.s3.garage.localhost` as `endpoint` unless you have that hostname in `/etc/hosts` and vhost routing.

There is a stale contradiction: older cookbook page [Configuring S3 clients](https://garagehq.deuxfleurs.fr/cookbook/clients.html) says “Garage does not support DNS-style buckets”. The current [configuration reference](https://garagehq.deuxfleurs.fr/documentation/reference-manual/configuration/) and [S3 compatibility](https://garagehq.deuxfleurs.fr/reference_manual/s3_compatibility.html) and [Existing integrations](https://garagehq.deuxfleurs.fr/documentation/connect/) all state that **both** styles work. Treat the configuration reference as authoritative.

rclone / Cyberduck docs still tell you to tick path-style for local endpoints. That is the right choice for `127.0.0.1:3900`.

---

## 8. `@aws-sdk/client-s3` configuration

Minimum that Garage itself documents (generic S3 client rules):

- **endpoint**: `http://127.0.0.1:3900` locally
- **region**: the `[s3_api].s3_region` value, usually `"garage"`. Wrong region → `AuthorizationHeaderMalformed` with a redirect to the correct region (some clients mishandle that).
- **credentials**: Key ID + secret from `--default-access-key` / `garage key create`
- **path style**: `forcePathStyle: true` (AWS SDK default is vhost)

rclone template in the same docs: `force_path_style = true`, `region = <region>`, `endpoint = <endpoint>`.

- [Existing integrations](https://garagehq.deuxfleurs.fr/documentation/connect/)
- [Browsing tools / rclone](https://garagehq.deuxfleurs.fr/documentation/connect/cli/)

### Checksums (the AWS SDK default-on trap)

AWS SDKs since late 2024 send CRC checksums on uploads by default (`request_checksum_calculation` default `WHEN_SUPPORTED`). JavaScript v3 **≥ 3.729.0** auto-sends **CRC32** on `PutObject` if you specify no algorithm.

- [AWS SDKs and Tools — Data Integrity Protections](https://docs.aws.amazon.com/sdkref/latest/guide/feature-dataintegrity.html)
- [SDK for JavaScript v3 — S3 checksums](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/s3-checksums.html)

Garage **v2.3.0 source** implements `x-amz-checksum-crc32`, `crc32c`, `crc64nvme`, `sha1`, `sha256` (parse + verify). So a **server-side** `PutObject` from AWS SDK JS 3.729+ talking to Garage v2.3.0 should validate CRC32 rather than 501.

Caveats:

1. The public [S3 compatibility](https://garagehq.deuxfleurs.fr/reference_manual/s3_compatibility.html) page still says “most `x-amz-` headers” are **not** implemented. That page is coarser than the v2.3.0 checksum module. Prefer the source for checksums.
2. **Presigned browser PUT** is different: the SDK that **generates** the URL may add `x-amz-checksum-*` / `x-amz-sdk-checksum-algorithm` to `SignedHeaders`. The browser `fetch`/`XMLHttpRequest` will not compute CRC32, the signature will not match, Garage will 403. Disable automatic request checksums on the client used to presign (`AWS_REQUEST_CHECKSUM_CALCULATION=WHEN_REQUIRED`, or the SDK equivalent `requestChecksumCalculation: "WHEN_REQUIRED"`).
3. If some future SDK default is an algorithm Garage does not parse (`XXHASH*`, `SHA512`, …), `parse_checksum_algorithm` returns `invalid checksum algorithm`. JS v3’s default CRC32 is in Garage’s allow-list.

Garage’s own presigned test uses the AWS Rust SDK and PUTs a body with no checksum headers; that is the pattern that is proven.

---

## Recommended shape for bitig-flow

1. Pin `dxflrs/garage:v2.3.0` (or newer once the team bumps). Do not use `latest`.
2. Commit a local `garage.toml` with `replication_factor = 1`, sqlite or lmdb, `s3_region = "garage"`, binds on 3900/3901/3903, persistent `metadata_dir` / `data_dir`.
3. Compose service command: `["/garage", "server", "--single-node", "--default-bucket"]`. Publish 3900 and 3903; 3901 for RPC; skip 3902 unless you later need public websites.
4. Put `GARAGE_DEFAULT_ACCESS_KEY`, `GARAGE_DEFAULT_SECRET_KEY`, `GARAGE_DEFAULT_BUCKET` in `.env`. **Do not change the secret against an existing volume.**
5. After first healthy `/health` on 3903, `PutBucketCors` once (owner key already granted). Repeat is safe (replace).
6. App `S3Client`:
   - `endpoint: process.env.S3_ENDPOINT` (`http://127.0.0.1:3900`)
   - `region: "garage"`
   - `forcePathStyle: true`
   - credentials from the default key
   - on the **presign** client: checksums `WHEN_REQUIRED`
7. Presign PUT for `org/<orgId>/doc/<docId>/<file>`; presign GET with `expiresIn: 60`.
8. Browser PUT to the S3 API origin (`:3900`), not the website origin (`:3902`).

---

## Unconfirmed

- **Not run**: this research did not start a container or round-trip a browser PUT against Garage. Layout/CORS/presign conclusions are from docs + v2.3.0 source/tests, not a live compose file in this repo.
- **JS SDK `S3Client` constructor field name** for checksums: AWS documents the shared setting `AWS_REQUEST_CHECKSUM_CALCULATION` / `request_checksum_calculation`. The exact TypeScript field on `@aws-sdk/client-s3`’s `S3ClientConfig` was not fetched successfully in this pass (API reference timed out). Confirm against the installed SDK types when implementing (`requestChecksumCalculation`).
- **Whether AWS SDK JS `getSignedUrl(PutObjectCommand)` in 3.729+ always signs checksum headers** was not verified against SDK source here. Treat “disable checksums on the presigner” as the safe default, not as a measured JS-v3 bug.
- **`cookbook/clients.html` vs current docs** on vhost support: older page says no DNS-style; current config + compatibility say yes. Unconfirmed which page the project’s doc build currently publishes as canonical for “clients” besides the configuration reference.
- **Docker image default `CMD`** beyond the documented `docker run … /garage server --single-node --default-bucket` override: assumed default is `garage server` because the cluster compose file passes no command. Not inspected in the image manifest.
- **PutBucketCors idempotence** under concurrent compose `depends_on` races: S3 replace should be fine; not tested.
- **Checksum trailer (`x-amz-trailer`) + streaming unsigned payload from browsers**: Garage has `request_trailer_checksum_algorithm` in checksum.rs. Browser simple PUT will not use trailers. Unconfirmed whether a misconfigured SDK streaming upload would hit that path locally.
- **GitHub `deuxfleurs/garage` vs forge**: implementation was read from `git.deuxfleurs.fr/Deuxfleurs/garage` (the repo the docs point at). GitHub may lag.
- **Production / Coolify**: out of scope, unexamined.
