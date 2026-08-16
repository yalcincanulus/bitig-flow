# bitig-flow

A document sharing app: an organization uploads or writes documents, groups them into vaults, and shares them through links that carry access gates. The people who open those links are anonymous, and the product's value is the analytics stream each link produces.

## Language

### Surfaces

**Dashboard**:
The authenticated, organization-scoped half of the app, at `/dashboard/*`. Backed by TanStack DB collections and therefore not server-rendered; its chrome is.
_Avoid_: app, admin, console, backoffice

**Viewer**:
The public, anonymous half, at `/v/<slug>`. Server-rendered, gated, and instrumented — it is where every Visit and Event comes from. It uses no collections.
_Avoid_: share page, public page, reader

**Chrome**:
The Dashboard's persistent frame — sidebar, organization switcher, user menu. It lives above the SSR boundary and renders on the server with real data, which is what keeps a cold load from looking empty.
_Avoid_: shell, layout, frame

### Content

**Document**:
A single piece of shared content — markdown written in the app, or an uploaded PDF or image.
_Avoid_: file, asset, doc

**Vault**:
A flat, unordered set of documents, shared as one unit.
_Avoid_: folder, collection, dataroom, group

### Storage

**Storage key**:
The single object path holding a document's bytes — `org/<orgId>/doc/<documentId>/original`. One object per document, carrying neither the original filename nor an extension.
_Avoid_: path, object name, blob key

**Confirmation**:
The step that turns a `pending` document into a `ready` one: the server reads the uploaded object back once, verifies it, and records its true size, type, checksum, and page count. Until it happens, the row exists and the bytes are unproven.
_Avoid_: finalize, commit, validate

**Sweep**:
The scheduled reconciliation between the database and the object store — reaping unconfirmed uploads and objects whose document row is gone. The mechanism by which cascade deletes eventually reach storage.
_Avoid_: cleanup, GC, prune

### Sharing

**Link**:
The shareable thing: a public URL pointing at one target, carrying its own gate, options, and analytics stream. A target may have many links, each with different rules.
_Avoid_: share, shareLink, invite

**Target**:
What a link points at — either a document or a vault. Never both.
_Avoid_: subject, resource

**Slug**:
The short random public identifier in a link's URL. Separate from the link's identity, so it can be rotated without losing analytics history.
_Avoid_: token, code, short id

**Gate**:
The set of requirements a link imposes before its target may be seen, and the flow a visitor walks to satisfy them.
_Avoid_: lock, wall, protection, auth

**Requirement**:
One condition within a gate — a password, an email address, or a verified email address. A gate with no requirements is public.
_Avoid_: access level, tier, permission

**Gate progress**:
One visitor's part-way state through one link's gate — which requirements they have cleared, and their outstanding verification code. Short-lived, exists only until the gate is satisfied, and there is exactly one per visitor per link.
_Avoid_: gate session, pending visit, attempt

**Receipt**:
How the gate shows a visitor their own gate progress — a list of the requirements they have already satisfied. It never names the requirements still ahead, so it discloses nothing to someone who has satisfied none.
_Avoid_: stepper, progress bar, wizard steps

**Sender line**:
The one piece of context the gate shows before any requirement is satisfied — the link's creator and their organization, and never the target. Degrades to the organization alone when the creator's account is gone.
_Avoid_: header, branding, attribution

### The people

**Visitor**:
The anonymous person who opens a link. A visitor is never a user, holds no account, and appears in no auth table.
_Avoid_: viewer, guest, recipient, lead

**User**:
Someone with an account, belonging to one or more organizations. The people who create documents and links.
_Avoid_: owner (that is a role), account, member (that is also a role)

**Organization**:
The tenant. Owns documents, vaults, and links; users belong to it with a role of owner, admin, or member.
_Avoid_: team, workspace, tenant, company

**Role**:
A user's single, fixed standing within one organization — owner, admin, or member. A user has one role per organization and may hold different roles in different ones. Roles govern people, not content: all three have full access to documents, vaults, and links.
_Avoid_: permission level, access level (that is a gate concept), group

**Permission**:
One action on one resource, granted to a role — `document:create`, `analytics:read`. The complete vocabulary lives in the access-control statements. A permission never depends on who created a row.
_Avoid_: capability, scope, grant, right

### Analytics

**Visit**:
One visitor's gated session on one link — created the moment its gate is satisfied, and expiring on its own schedule. The unit every analytics event hangs from.
_Avoid_: session, visitor session, access

**View**:
One document being opened within a visit. A visit on a vault link may contain many views, and re-opening the same document is a second view. A view is not a table — it is recorded as a `document_opened` event.
_Avoid_: read, open, impression

**Event**:
A typed, append-only analytics record belonging to a visit and naming a document. The vocabulary is exactly three: `document_opened`, `page_dwell`, `download`. Anything already held as a column on **Visit** — the captured email, its verification, the start and last-seen times — is not an event.
_Avoid_: activity, log, hit

**Dwell**:
Time a visitor spent on one page of one document, accumulated in the browser and reported by the **Beacon**. Pages exist for PDFs; markdown and images always report page 1.
_Avoid_: time on page, engagement, duration

**Beacon**:
The anonymous `sendBeacon` write that carries dwell from the viewer to our origin. It is authenticated solely by the visit cookie and is the only analytics writer that is not the server itself.
_Avoid_: ping, telemetry, tracker

**Visitor id**:
A long-lived opaque identifier that groups a returning visitor's visits together. Purely for analytics; it never grants access. A captured email supersedes it as the stronger identity.
_Avoid_: fingerprint, anonymous id, device id
