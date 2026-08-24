# Operations is global and Organization-blind

**Operations** lives outside the Dashboard and is authorized by a dedicated tier that matches the authenticated User's immutable id to the singleton **Platform Operator** binding and requires TOTP enrollment. It requires no active Organization, preloads no Organization collections, and grants no implicit access to any Organization's content.

Reusing Organization owner or admin would conflate deployment authority with a tenant Role, while placing Operations under the Dashboard would make global policy depend on whichever Organization happened to be active. Global repositories may read deployment policy, Demo Environment usage, and content-free Demo Summaries, but this exception to ADR-0011 is not a path around Organization scoping for Documents, Vaults, Links, Visits, or Events.
