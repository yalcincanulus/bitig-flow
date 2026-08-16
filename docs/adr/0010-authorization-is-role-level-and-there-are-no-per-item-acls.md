# Authorization is role-level, and there are no per-item ACLs

**A user's permissions are a pure function of their role in the active organization.** Nothing is decided by who created a row. better-auth's `createAccessControl` defines the vocabulary, and the three fixed roles carry explicit grants over it:

| Resource | owner | admin | member |
| --- | --- | --- | --- |
| `organization` | update, delete | update | — |
| `member` | create, update, delete | create, update, delete | — |
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
