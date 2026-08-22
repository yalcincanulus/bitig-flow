/**
 * What a stranger holding an **Invitation** id is allowed to learn: who is asking, and whether
 * the offer is still live. Never the invited address, never the **Role** (ADR-0066).
 */
export type InvitationPreview =
  | Readonly<{
      status: "valid";
      organizationName: string;
      inviterName: string | null;
    }>
  | Readonly<{
      status: "expired";
      organizationName: string;
    }>
  | Readonly<{
      status: "unavailable";
    }>;

type InvitationRow = Readonly<{
  status: string;
  expiresAt: Date;
  organizationName: string;
  inviterName: string | null;
  inviterIsMember: boolean;
}>;

/**
 * Classify a loaded **Invitation** the way Better Auth will not: expired stays named, canceled and
 * invented collapse into one silent miss.
 */
export function invitationPageFrom(row: InvitationRow | null, now: Date): InvitationPreview {
  if (!row || row.status !== "pending") return { status: "unavailable" };
  if (row.expiresAt <= now) {
    return { status: "expired", organizationName: row.organizationName };
  }

  return {
    status: "valid",
    organizationName: row.organizationName,
    inviterName: row.inviterIsMember ? row.inviterName : null,
  };
}
