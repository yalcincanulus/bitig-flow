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

**Preview**:
The owner's view of a rendered **Document**, on the Dashboard. It goes through the same render module the **Viewer** uses, so what an owner checks is what a **Visitor** gets. It is not a pane inside the editor.
_Avoid_: live preview, draft view, rendered view

**People**:
The Dashboard surface listing an **Organization**'s **Memberships** and its pending **Invitations**. Everyone in the organization can read it; only owners and admins can act on it. It is not where the organization itself is configured.
_Avoid_: members page, team, users, roster, directory

**Operations**:
The deployment-wide surface reserved for the **Platform Operator**. It governs the portfolio sandbox and is outside every **Organization**; it is not an Organization settings page.
_Avoid_: admin dashboard, admin panel, console, backoffice

**Deployment Policy**:
The live, deployment-wide rules that govern durable signup, demo admission, and Demo Environment resource limits. It can restrict a runtime capability but can never create one that the deployment does not have.
_Avoid_: settings, configuration, feature flags, admin preferences

### Content

**Document**:
A single piece of shared content — markdown written in the app, or an uploaded PDF or image.
_Avoid_: file, asset, doc

**Vault**:
A flat, unordered set of documents, shared as one unit.
_Avoid_: folder, collection, dataroom, group

**Visibility**:
Whether a **Vault**'s member Document is served through that Vault's **Links**. It belongs to the membership, so the same Document may be hidden in one Vault and shown in another. Hiding withdraws the Document from the index and from **Reachable**, and never removes it from the Vault.
_Avoid_: published, enabled, active, draft

**Reference**:
A markdown **Document**'s use of an image Document inside its text. The referenced Document is an ordinary Document that happens to be embedded — it is not a lesser kind of thing, and it holds no bytes of its own beyond the ones it already had.
_Avoid_: attachment, embed, inline image

**Reachable**:
The property that decides which documents a **Link** may serve bytes for: its **Target**, the documents in a target Vault, and the **References** of those. One hop, never further. Being reachable permits bytes and is not a **View**.
_Avoid_: allowed, permitted, in scope

### Storage

**Storage key**:
The single object path holding a document's bytes — `org/<orgId>/doc/<documentId>/original`. One object per document, carrying neither the original filename nor an extension.
_Avoid_: path, object name, blob key

**Upload key**:
A random, short-lived object path that receives unconfirmed upload bytes. It is never served as a Document, and Confirmation removes it after writing verified bytes to the immutable **Storage key**.
_Avoid_: staging path, temporary Storage key, pending Document

**Confirmation**:
The step that turns a `pending` document into a `ready` one: the server reads the uploaded object back once, verifies it, and records its true size, type, checksum, and page count. Until it happens, the row exists and the bytes are unproven.
_Avoid_: finalize, commit, validate

**Sweep**:
The scheduled reconciliation between the database and the object store — reaping unconfirmed uploads and objects whose document row is gone. The mechanism by which cascade deletes eventually reach storage.
_Avoid_: cleanup, GC, prune

**Reaper**:
The scheduled deletion of expired **Demo Environments** from the domain model. It deletes the Organization before its Demo User and leaves failed object removal to the **Sweep**.
_Avoid_: Sweep, retention job, garbage collection, purge

### Sharing

**Link**:
The shareable thing: a public URL pointing at one target, carrying its own gate, options, and analytics stream. A target may have many links, each with different rules. Creating one is the act of publication — a **Document** nothing points at is unreachable, which is why there is no separate draft state.
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
The one piece of context a page shows to someone holding an opaque identifier and nothing else — who is asking, and never what is behind it. On a **Gate** it is the **Link**'s creator and their organization, never the **Target**; on an **Invitation** it is the inviter and their organization, never the invited address. Degrades to the organization alone when that person's account is gone, or when they have left the organization.
_Avoid_: header, branding, attribution

**Demo Report**:
One public, fixed-category claim that a **Demo Environment** is serving abusive content. It can include optional details of 280 characters or fewer. Three reports from distinct short-lived network hashes permanently pause the environment. Reports contain no reporter identity and are never analytics.
_Avoid_: moderation ticket, complaint, abuse Event, feedback

### The people

**Visitor**:
The anonymous person who opens a link. A visitor is never a user, holds no account, and appears in no auth table.
_Avoid_: viewer, guest, recipient, lead

**User**:
Someone with an account, belonging to one or more organizations. The people who create documents and links.
_Avoid_: owner (that is a role), account, member (that is also a role)

**Platform Operator**:
The one non-transferable deployment authority who governs the portfolio sandbox through **Operations**. The Platform Operator is not an Organization **Role** and has no delegates.
_Avoid_: admin, super admin, site admin, owner

**Demo User**:
A short-lived **User** created by one-click demo entry without credentials or personal information. A Demo User is the sole owner of the isolated Organization in its **Demo Environment** and can never become a durable User.
_Avoid_: guest, Visitor, anonymous visitor, trial user

**Demo Environment**:
One Demo User's isolated Organization and everything that Organization owns. It is deleted as one unit 24 hours after creation, never shares content with another Demo Environment, and cannot be extended through activity.
_Avoid_: guest account, shared sandbox, demo workspace, tenant

**Organization**:
The tenant. Owns documents, vaults, and links; users belong to it through a **Membership**.
_Avoid_: team, workspace, tenant, company

**Membership**:
One **User**'s standing in one **Organization**, carrying exactly one **Role**. A user holds at most one membership per organization, and holds them in many organizations independently — the same person may own one organization and hold the member role in another. It is the thing that is created by accepting an **Invitation** and destroyed by removal.
_Avoid_: member (that is a role), seat, affiliation, participation

**Invitation**:
An offer of a **Membership**, addressed to one email address, naming the **Role** the membership will carry, and expiring on its own schedule. The address is binding: only a signed-in **User** holding that address may accept, and accepting is the act that creates the membership. An **Organization** has at most one outstanding invitation per address.
_Avoid_: invite, request, join link, referral

**Role**:
A user's single, fixed standing within one organization — owner, admin, or member. A user has one role per organization and may hold different roles in different ones. Roles govern people, not content: all three have full access to documents, vaults, and links.
_Avoid_: permission level, access level (that is a gate concept), group

**Permission**:
One action on one resource, granted to a role — `document:create`, `analytics:read`. The complete vocabulary lives in the access-control statements. A permission never depends on who created a row.
_Avoid_: capability, scope, grant, right

### Analytics

**Demo Summary**:
A content-free record of one ended **Demo Environment**: its lifetime, end reason, peak resource use, coarse feature counts, and quota refusals. It contains no User identity, network identity, content identity, title, or filename.
_Avoid_: audit log, activity log, session replay, demo analytics event

**Viewer identity**:
The non-transitive identity used to group Visits: a captured email when present, otherwise the Visitor id. Distinct Viewer identities are what analytics calls unique visitors.
_Avoid_: unique Visitor id, person

**Total time**:
The sum of Dwell recorded within an analytics scope.
_Avoid_: engagement time, time spent

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
The anonymous `sendBeacon` write that carries dwell from the viewer to our origin — for every Document it accumulated against since the last one, not just the one on screen. It is authenticated solely by the visit cookie and is the only analytics writer that is not the server itself.
_Avoid_: ping, telemetry, tracker

**Visitor id**:
A long-lived opaque identifier that groups a returning visitor's visits together. Purely for analytics; it never grants access. A captured email supersedes it as the stronger identity.
_Avoid_: fingerprint, anonymous id, device id
