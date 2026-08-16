# Endpoints authenticated by the visit cookie live under the link's path

The gate session is a signed HttpOnly cookie scoped to one Link, and ADR-0027 makes it the *sole* authenticator of the Beacon — nothing in the request body is trusted, the Link's identity included. That only holds if the cookie itself carries the Link identity, which means setting `Path=/v/<slug>` and putting every endpoint that needs it underneath:

| Route | Credential |
| --- | --- |
| `/v/$slug` · `/v/$slug/$documentId` | visit cookie |
| `/v/$slug/bytes/$documentId` | visit cookie |
| `/v/$slug/beacon` | visit cookie |
| `/api/doc/$documentId/bytes` | organization session |
| `/api/auth/$` | better-auth |

The browser then enforces the scoping for free: a Visitor holding cookies for ten Links sends exactly one per request, and a cookie can never reach an endpoint belonging to a different Link. The alternative — `Path=/` plus a slug in the request body — puts the Link identity in precisely the place ADR-0027 says must not be believed.

The Dashboard byte route sits deliberately outside this neighbourhood. ADR-0018 gave the two byte paths separate credentials, and keeping them in separate path namespaces means neither can ever be reached with the other's cookie by accident.

This is a path-layout decision, not a new server surface: the four server routes are still the four already counted.

## The byte route's query contract

`/v/$slug/bytes/$documentId` serves both the inline view and the download, so the request must say which:

- **no parameter** — inline view. No Event is written. This is what pdf.js buffers and what an `<img>` fetches.
- **`?download=button`** — writes `download` and serves with `Content-Disposition: attachment`.

Without that split every PDF open would log a download.

This narrows ADR-0023's `download` payload from `{ via: 'button' | 'print' }` to `{ via: 'button' }`. A print is a client-side gesture the byte route never observes — for a PDF the bytes are already in memory — so recording it would mean trusting the browser to report an action the server did not witness, against both ADR-0026 and ADR-0027. Re-requesting the bytes purely to log a print was rejected as a round-trip whose only product is telemetry, and one that still cannot catch Ctrl+P.
