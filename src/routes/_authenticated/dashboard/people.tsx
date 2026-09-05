import { createFileRoute } from "@tanstack/react-router";
import { MailIcon } from "lucide-react";

import { Page, PageActions, PageHeader, PageTitle } from "#/components/page";
import { CancelInvitationDialog, InvitePersonDialog } from "#/components/people-invitations";
import { MembershipActions, type Membership } from "#/components/people-memberships";
import { Avatar, AvatarFallback, AvatarImage } from "#/components/ui/avatar";
import { Badge } from "#/components/ui/badge";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "#/components/ui/empty";
import { TableFrame } from "#/components/table-frame";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "#/components/ui/table";
import { hasPermission, roleSchema, type OrganizationRole } from "#/lib/access-control";
import { authClient } from "#/lib/auth-client";
import { dashboardDestinations } from "#/lib/dashboard-destinations";
import { initials } from "#/lib/initials";
import { byStanding, readsOutstandingInvitations, roleLabel } from "#/lib/people";
import { listOutstandingInvitations } from "#/server/functions/people";

type OutstandingInvitation = Awaited<ReturnType<typeof listOutstandingInvitations>>[number];

export const Route = createFileRoute("/_authenticated/dashboard/people")({
  loader: async ({ context: { organization, role } }) => {
    // The Memberships come from Better Auth directly (ADR-0034's amendment): the listing already
    // carries each person's name, email, and image, so this needs no join and no second call.
    const listing = await authClient.organization.listMembers({
      query: { organizationId: organization.id },
    });
    // Better Auth's own message is not passed on: the three outcomes a caller is owed are the
    // sign-in redirect, not-found, and forbidden, and the Chrome's `beforeLoad` has already settled
    // all three by the time this runs. What is left is a read that failed, said in our words.
    if (listing.error) {
      throw new Error("Could not read the people of this organization");
    }

    const memberships: Membership[] = listing.data.members
      .map((membership) => ({
        id: membership.id,
        role: roleSchema.parse(membership.role),
        user: membership.user,
      }))
      .sort(byStanding);

    return {
      memberships,
      // A member is never shown the section, so their visit never asks for it. The server refuses
      // the read regardless; not asking is what stops a Role being discovered by a failure.
      invitations: readsOutstandingInvitations(role)
        ? await listOutstandingInvitations()
        : undefined,
    };
  },
  component: PeoplePage,
});

/** An owner or an admin is who a colleague goes to, so only those two are coloured. */
function RoleBadge({ role }: Readonly<{ role: OrganizationRole }>) {
  return <Badge variant={role === "member" ? "outline" : "secondary"}>{roleLabel(role)}</Badge>;
}

function MembershipTable({
  memberships,
  callerRole,
  organizationId,
  demo,
}: Readonly<{
  memberships: readonly Membership[];
  callerRole: OrganizationRole;
  organizationId: string;
  demo: boolean;
}>) {
  const showsActions = hasPermission(callerRole, { member: ["update"] });

  return (
    <TableFrame>
      <TableHeader>
        <TableRow className="bg-muted/40 hover:bg-muted/40">
          <TableHead className="pl-3">Person</TableHead>
          <TableHead>Email</TableHead>
          <TableHead className={showsActions ? "w-0" : "w-0 pr-3"}>Role</TableHead>
          {showsActions ? (
            <TableHead className="w-0 pr-3">
              <span className="sr-only">Actions</span>
            </TableHead>
          ) : null}
        </TableRow>
      </TableHeader>
      <TableBody>
        {memberships.map((membership) => (
          <TableRow key={membership.id}>
            <TableCell className="max-w-56 pl-3 font-medium">
              <div className="flex items-center gap-2">
                <Avatar size="sm">
                  {membership.user.image ? (
                    <AvatarImage src={membership.user.image} alt="" />
                  ) : null}
                  <AvatarFallback>{initials(membership.user.name)}</AvatarFallback>
                </Avatar>
                <span className="truncate">{membership.user.name}</span>
              </div>
            </TableCell>
            <TableCell className="max-w-64 text-muted-foreground">
              <span className="block truncate">{membership.user.email}</span>
            </TableCell>
            <TableCell className={showsActions ? undefined : "pr-3"}>
              <RoleBadge role={membership.role} />
            </TableCell>
            {showsActions ? (
              <TableCell className="pr-3">
                <MembershipActions
                  membership={membership}
                  memberships={memberships}
                  callerRole={callerRole}
                  organizationId={organizationId}
                  demo={demo}
                />
              </TableCell>
            ) : null}
          </TableRow>
        ))}
      </TableBody>
    </TableFrame>
  );
}

/**
 * The **Invitations** nobody has accepted yet — an owner's and an admin's half of the surface.
 *
 * There is no way to issue one from here yet, so the empty state says who the section is for rather
 * than offering an action that does not exist.
 */
function OutstandingInvitations({
  invitations,
  demo,
}: Readonly<{ invitations: readonly OutstandingInvitation[]; demo: boolean }>) {
  return (
    <section className="flex flex-col gap-3" aria-labelledby="outstanding-invitations">
      <h2 id="outstanding-invitations" className="text-sm font-medium">
        Outstanding invitations
      </h2>
      {invitations.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <MailIcon />
            </EmptyMedia>
            <EmptyTitle>No outstanding invitations</EmptyTitle>
            <EmptyDescription>Nobody is waiting to join this organization.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <TableFrame>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead className="pl-3">Email</TableHead>
              <TableHead className="w-0">Role</TableHead>
              <TableHead className="pr-3">Expires</TableHead>
              <TableHead className="w-0 pr-3">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {invitations.map((invitation) => (
              <TableRow key={invitation.id}>
                <TableCell className="max-w-64 pl-3 font-medium">
                  <span className="block truncate">{invitation.email}</span>
                </TableCell>
                <TableCell>
                  <RoleBadge role={invitation.role} />
                </TableCell>
                <TableCell className="pr-3 text-muted-foreground">
                  {new Date(invitation.expiresAt).toLocaleDateString()}
                </TableCell>
                <TableCell className="pr-3 text-right">
                  <CancelInvitationDialog invitation={invitation} demo={demo} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </TableFrame>
      )}
    </section>
  );
}

function PeoplePage() {
  const { memberships, invitations } = Route.useLoaderData();
  const { organization, role, demo } = Route.useRouteContext();

  return (
    <Page>
      <PageHeader>
        <PageTitle>{dashboardDestinations.people.label}</PageTitle>
        {invitations === undefined ? null : (
          <PageActions>
            <InvitePersonDialog
              organizationId={organization.id}
              callerRole={role}
              demo={Boolean(demo)}
            />
          </PageActions>
        )}
      </PageHeader>

      <MembershipTable
        memberships={memberships}
        callerRole={role}
        organizationId={organization.id}
        demo={Boolean(demo)}
      />

      {invitations === undefined ? null : (
        <OutstandingInvitations invitations={invitations} demo={Boolean(demo)} />
      )}
    </Page>
  );
}
