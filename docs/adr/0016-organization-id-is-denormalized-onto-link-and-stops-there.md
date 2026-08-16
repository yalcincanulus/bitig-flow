# Organization id is denormalized onto link, and stops there

**`document`, `vault`, and `link` each carry `organization_id`; `visit` and `visit_event` do not.**

ADR-0011 requires every repository function to take `orgId: OrganizationId` as its first parameter, which means every scoped query needs a cheap way to reach the tenant. For `document` and `vault` the column is simply the truth. For `link` it is a denormalization, and the alternative is worse: without it, scoping any link query means joining through the **nullable FK pair** of ADR-0001 — `LEFT JOIN document ... LEFT JOIN vault ... WHERE COALESCE(...) = $1` — which is awkward, easy to write wrongly, and wrong in the direction that leaks another organization's rows. A denormalized key that makes the safe query the obvious one is worth its invariant.

**The invariant is that a link's `organization_id` equals its target's.** It is established at creation, in the repository layer, and nothing ever moves a **Document** or **Vault** between organizations, so nothing can drift it. A database-level guarantee would need either a composite foreign key over `(id, organization_id)` on both target tables or a trigger; neither earns its complexity against an invariant with no mutation path.

**`visit` and `visit_event` reach their organization through one clean non-nullable `link_id` hop, and that is where the denormalization stops.** These are the two tables that grow without bound, and they are also the two that the viewer path writes — a path which, by ADR-0011, has no organization in scope at all. Putting a tenant key on a row written by a request that holds no tenant would mean deriving it on every insert, on the hot path, to save a join on the dashboard's cold path. The analytics queries take the join.
