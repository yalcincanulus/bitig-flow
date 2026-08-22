# Authorization is role-level, and there are no per-item ACLs

**A user's permissions are a pure function of their role in the active organization.** Nothing is decided by who created a row. better-auth's `createAccessControl` defines the vocabulary, and the three fixed roles carry explicit grants over it:

| Resource | owner | admin | member |
| --- | --- | --- | --- |
| `organization` | update, delete | update | — |
| `member` | read, create, update, delete | read, create, update, delete | read |
| `invitation` | create, cancel | create, cancel | — |
| `document` | create, read, update, delete | create, read, update, delete | create, read, update, delete |
| `vault` | create, read, update, delete | create, read, update, delete | create, read, update, delete |
| `link` | create, read, update, delete | create, read, update, delete | create, read, update, delete |
| `analytics` | read | read | read |

The first three resources come from better-auth's `defaultStatements`; because redefining a role named `owner`/`admin`/`member` *replaces* the built-in set rather than extending it, `defaultStatements` and the built-in `ownerAc`/`adminAc`/`memberAc` statements must be spread into our definitions. The last four are ours.

**The line is that admins govern people and members are full content collaborators.** A member can create a **Link**, which is the act that exposes a document publicly. This is deliberate: any tighter line needs an ownership dimension — "delete only the documents you uploaded" — and ownership is exactly what role-level statements cannot express, so it would become a hidden rule enforced somewhere else. The threat model is already fixed as a careless colleague rather than a hostile stranger, and the honest expression of that is that you invite people you trust.

The accepted cost is that deletes cascade: a member deleting a **Document** destroys other members' links and their analytics history. We take it rather than introduce a per-item ACL.

**`analytics:read` is organization-wide.** A member sees the numbers for links they did not create. Everyone in the organization can already open every link, so hiding its analytics from them protects nothing, and the alternative — a `created_by` filter in the repository layer — is a per-item rule invisible to the permission vocabulary.

**The `read` actions look vacuous and are kept anyway.** Every role holds `document:read`, `vault:read`, and `link:read`, so no check ever fails on them. They exist so that "any member of an organization can see all of its content" is written down as a grant rather than inferred from the absence of one.

**Roles are single-valued.** better-auth stores `member.role` as a free string and supports comma-separated multiple roles; we do not. The role is parsed through `z.enum(["owner","admin","member"])` when it is read, and anything else — a comma, a stale value — throws as a data-integrity failure rather than falling back to the lowest privilege. A silent downgrade looks like the safe default but turns a corrupted row into a permissions bug nobody traces.

**The public viewer path is outside all of this.** A **Visitor** holds no role and appears in no `member` row; their access is authorized by satisfying a **Gate**, never by a permission check.

## Amendment: `member:read` is ours, and owner rank is not a permission at all

**`member: ["read"]` is an action we invented, and every role holds it.** Better Auth's `defaultStatements` gives the `member` resource only `create`, `update`, and `delete`, and its `listMembers` endpoint checks no permission whatsoever — bare membership in the organization is enough. So a member can already read the roster, and the grant we add is one Better Auth will never consult. We add it anyway, for the reason the vacuous `document:read` is kept above: "everyone in an organization can see who else is in it" should be a written grant rather than a fact inferred from an endpoint's missing check. Our own read path asserts it, which is what stops it from being decoration.

Pending **Invitations** are the exception on the **People** surface. They are shown to owners and admins only, which needs no new statement — `invitation: ["create", "cancel"]` is already exclusive to those two roles, so the existing matrix decides it.

**"Only an owner may mint an owner" is a rank rule, and the statement vocabulary cannot express it.** The single difference between `ownerAc` and `adminAc` at the statement level is `organization:delete`. Everything else separating the two roles is hard-coded comparison against `creatorRole` inside Better Auth's handlers: `updateMemberRole` refuses to set the owner role unless the caller holds it, `createInvitation` refuses to issue an invitation carrying it on the same test, and `removeMember` refuses to remove an owner except by a fellow owner and never the last one. None of that is visible in the matrix above, and a reader auditing the table would conclude an admin can promote anyone. It cannot be moved into the statements either, because the checks compare role *names* rather than evaluating grants. The consequence for the Dashboard is that the invite form's role choices — owner, admin, and member for an owner; admin and member for an admin — come from a rule written once and named as a rank rule, not from `checkRolePermission`.

The three last-owner guards are read-then-write rather than transactional, so concurrent demotions can race an organization into having no owner. The client predicts and disables what it can see and still handles the thrown error, because its roster may be stale — the same relationship ADR-0013 sets between cosmetic client checks and real server enforcement.
