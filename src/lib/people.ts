import { hasPermission, type OrganizationRole } from "#/lib/access-control";

const roleLabels = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
} as const satisfies Record<OrganizationRole, string>;

/** A **Role** as the People surface says it, which is CONTEXT.md's word with a capital letter. */
export function roleLabel(role: OrganizationRole): string {
  return roleLabels[role];
}

/**
 * Whether a **Role** sees the **Organization**'s outstanding **Invitations**.
 *
 * ADR-0010's amendment settles this without inventing a statement: `invitation:create` is already
 * exclusive to owners and admins, so the existing matrix decides who the section is for. This is
 * the cosmetic half of that rule; `listOutstandingInvitations` enforces the same grant server-side,
 * which is what makes hiding the section honest rather than the only thing standing in the way.
 */
export function readsOutstandingInvitations(role: OrganizationRole): boolean {
  return hasPermission(role, { invitation: ["create"] });
}

type InvitationRecord = Readonly<{
  status: string;
  expiresAt: Date;
}>;

/**
 * The **Invitations** somebody could still accept, out of every one the **Organization** has ever
 * issued.
 *
 * Better Auth's listing returns spent rows alongside live ones, and it never transitions a lapsed
 * **Invitation** out of `pending` (ADR-0066) — so neither the status nor the expiry alone tells the
 * truth, and both are read here.
 */
export function outstandingInvitations<Invitation extends InvitationRecord>(
  invitations: readonly Invitation[],
  now: Date,
): Invitation[] {
  return invitations.filter(
    (invitation) => invitation.status === "pending" && invitation.expiresAt > now,
  );
}

const roleRank = { owner: 0, admin: 1, member: 2 } as const satisfies Record<
  OrganizationRole,
  number
>;

type MembershipOrder = Readonly<{
  role: OrganizationRole;
  user: Readonly<{ name: string }>;
}>;

/**
 * The order the **Memberships** read in: the people who administer the **Organization** first, then
 * everyone else alphabetically. Better Auth returns **Memberships** in insertion order, which tells
 * a reader who joined when and nothing they came to the page for.
 */
export function byStanding(left: MembershipOrder, right: MembershipOrder): number {
  return (
    roleRank[left.role] - roleRank[right.role] || left.user.name.localeCompare(right.user.name)
  );
}
