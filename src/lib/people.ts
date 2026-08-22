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

const invitationRolesByInviter = {
  owner: ["owner", "admin", "member"],
  admin: ["admin", "member"],
  member: [],
} as const satisfies Record<OrganizationRole, readonly OrganizationRole[]>;

/**
 * The Roles a caller may offer in a new **Invitation**.
 *
 * This is a rank rule, not a permission: Better Auth compares the invited Role with its configured
 * creator Role inside the invitation handler, and its access-control statements cannot express
 * that an admin may invite an admin but not an owner. The server remains the enforcement point;
 * this copy keeps the form from offering an action Better Auth will refuse.
 */
export function invitationRoleChoices(role: OrganizationRole): readonly OrganizationRole[] {
  return invitationRolesByInviter[role];
}

/**
 * The Roles a caller may assign on an existing **Membership**.
 *
 * Same rank rule as {@link invitationRoleChoices}: only an owner may mint an owner. Better Auth's
 * `updateMemberRole` enforces it; this copy keeps the form from offering a Role it will refuse.
 */
export function membershipRoleChoices(role: OrganizationRole): readonly OrganizationRole[] {
  return invitationRolesByInviter[role];
}

type MembershipStanding = Readonly<{
  role: OrganizationRole;
}>;

function ownerCount(memberships: readonly MembershipStanding[]): number {
  return memberships.filter((membership) => membership.role === "owner").length;
}

/**
 * Why a Role change would be refused, or `undefined` if Better Auth would accept it.
 *
 * Rank and last-owner rules live in the handlers (ADR-0010's amendment). This copy predicts them
 * so the People surface can disable the action and name the reason. The server remains the
 * enforcement point, and the thrown-error path stays live because those Memberships can be stale.
 */
export function roleChangeRefusal(
  callerRole: OrganizationRole,
  target: MembershipStanding,
  nextRole: OrganizationRole,
  memberships: readonly MembershipStanding[],
): string | undefined {
  if (!hasPermission(callerRole, { member: ["update"] })) {
    return "Your Role cannot change a Membership.";
  }
  if (callerRole !== "owner" && target.role === "owner") {
    return "An admin cannot change an Owner's Role.";
  }
  if (callerRole !== "owner" && nextRole === "owner") {
    return "Only an Owner can grant the Owner Role.";
  }
  if (target.role === "owner" && nextRole !== "owner" && ownerCount(memberships) === 1) {
    return "The last Owner cannot be demoted.";
  }
  return undefined;
}

/**
 * Why a removal would be refused, or `undefined` if Better Auth would accept it.
 *
 * Same relationship as {@link roleChangeRefusal}: the client predicts, the handler decides.
 */
export function removalRefusal(
  callerRole: OrganizationRole,
  target: MembershipStanding,
  memberships: readonly MembershipStanding[],
): string | undefined {
  if (!hasPermission(callerRole, { member: ["delete"] })) {
    return "Your Role cannot remove a Membership.";
  }
  if (callerRole !== "owner" && target.role === "owner") {
    return "An admin cannot remove an Owner.";
  }
  if (target.role === "owner" && ownerCount(memberships) === 1) {
    return "The last Owner cannot be removed.";
  }
  return undefined;
}

/**
 * Why the Change Role action itself is disabled, or `undefined` if at least one other Role can
 * still be granted.
 *
 * Last-owner demote and admin-versus-owner are whole-action refusals: every alternative the caller
 * is ranked to offer would fail, so the trigger is disabled with that reason rather than opening a
 * form whose every choice is certain to fail.
 */
export function changeRoleActionRefusal(
  callerRole: OrganizationRole,
  target: MembershipStanding,
  memberships: readonly MembershipStanding[],
): string | undefined {
  const alternatives = membershipRoleChoices(callerRole).filter((role) => role !== target.role);
  if (alternatives.length === 0) {
    return roleChangeRefusal(callerRole, target, "member", memberships);
  }

  const refusals = alternatives.map((role) =>
    roleChangeRefusal(callerRole, target, role, memberships),
  );
  const firstRefusal = refusals.find((refusal) => refusal !== undefined);
  return firstRefusal !== undefined && refusals.every((refusal) => refusal !== undefined)
    ? firstRefusal
    : undefined;
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
