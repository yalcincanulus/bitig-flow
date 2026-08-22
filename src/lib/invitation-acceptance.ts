export type InvitationAcceptance =
  | Readonly<{ status: "wrong-account" }>
  | Readonly<{
      status: "ready";
      organizationId: string;
      alreadyMember: boolean;
    }>;
