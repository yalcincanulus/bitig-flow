import { useRouter } from "@tanstack/react-router";
import { UserCogIcon, UserMinusIcon } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "#/components/ui/alert-dialog";
import { Alert, AlertDescription } from "#/components/ui/alert";
import { Button } from "#/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "#/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "#/components/ui/field";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select";
import { Spinner } from "#/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "#/components/ui/tooltip";
import { roleSchema, type OrganizationRole } from "#/lib/access-control";
import { authClient } from "#/lib/auth-client";
import {
  changeRoleActionRefusal,
  membershipRoleChoices,
  removalRefusal,
  roleChangeRefusal,
  roleLabel,
} from "#/lib/people";

export type Membership = Readonly<{
  id: string;
  role: OrganizationRole;
  user: Readonly<{ name: string; email: string; image?: string | null }>;
}>;

function roleChangeFailure(code: string | undefined): string {
  switch (code) {
    case "YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_MEMBER":
      return "You cannot change this person's role.";
    case "YOU_CANNOT_LEAVE_THE_ORGANIZATION_WITHOUT_AN_OWNER":
      return "The organization must keep at least one owner.";
    case "MEMBER_NOT_FOUND":
      return "This person no longer belongs to this organization.";
    default:
      return "Could not change this role.";
  }
}

function removalFailure(code: string | undefined): string {
  switch (code) {
    case "YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_MEMBER":
      return "You cannot remove this person.";
    case "YOU_CANNOT_LEAVE_THE_ORGANIZATION_AS_THE_ONLY_OWNER":
      return "This owner cannot be removed.";
    case "MEMBER_NOT_FOUND":
      return "This person no longer belongs to this organization.";
    default:
      return "Could not remove this person.";
  }
}

async function refreshPeople(router: ReturnType<typeof useRouter>) {
  try {
    await router.invalidate({ sync: true });
  } catch {
    // The mutation has already committed. A reload keeps the list authoritative without telling
    // the caller that a Role was not changed or a Membership was not removed when it was.
    window.location.reload();
  }
}

function DisabledReason({ reason, children }: Readonly<{ reason: string; children: ReactNode }>) {
  return (
    <Tooltip>
      <TooltipTrigger render={<span className="inline-flex" />}>{children}</TooltipTrigger>
      <TooltipContent className="max-w-64">{reason}</TooltipContent>
    </Tooltip>
  );
}

export function MembershipActions({
  membership,
  memberships,
  callerRole,
  organizationId,
  demo = false,
}: Readonly<{
  membership: Membership;
  memberships: readonly Membership[];
  callerRole: OrganizationRole;
  organizationId: string;
  demo?: boolean;
}>) {
  if (demo) {
    return (
      <Button variant="ghost" size="sm" disabled>
        <UserCogIcon data-icon="inline-start" />
        Disabled in demo
      </Button>
    );
  }

  return (
    <div className="flex items-center justify-end gap-1">
      <ChangeRoleDialog
        membership={membership}
        memberships={memberships}
        callerRole={callerRole}
        organizationId={organizationId}
      />
      <RemoveMembershipDialog
        membership={membership}
        memberships={memberships}
        callerRole={callerRole}
        organizationId={organizationId}
      />
    </div>
  );
}

function ChangeRoleDialog({
  membership,
  memberships,
  callerRole,
  organizationId,
}: Readonly<{
  membership: Membership;
  memberships: readonly Membership[];
  callerRole: OrganizationRole;
  organizationId: string;
}>) {
  const router = useRouter();
  const reason = changeRoleActionRefusal(callerRole, membership, memberships);
  const roleChoices = membershipRoleChoices(callerRole);
  const roleItems = Object.fromEntries(roleChoices.map((role) => [role, roleLabel(role)]));
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<OrganizationRole>(membership.role);
  const [failure, setFailure] = useState<string>();
  const [pending, setPending] = useState(false);

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (nextOpen) {
      setRole(membership.role);
    }
    setFailure(undefined);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFailure(undefined);
    setPending(true);

    let result: Awaited<ReturnType<typeof authClient.organization.updateMemberRole>>;
    try {
      result = await authClient.organization.updateMemberRole({
        memberId: membership.id,
        role,
        organizationId,
      });
    } catch {
      setFailure("Could not change this role.");
      setPending(false);
      return;
    }
    if (result.error) {
      setFailure(roleChangeFailure(result.error.code));
      setPending(false);
      return;
    }

    setPending(false);
    handleOpenChange(false);
    await refreshPeople(router);
  }

  if (reason) {
    return (
      <DisabledReason reason={reason}>
        <Button variant="ghost" size="sm" disabled>
          <UserCogIcon data-icon="inline-start" />
          Change role
        </Button>
      </DisabledReason>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button variant="ghost" size="sm" />}>
        <UserCogIcon data-icon="inline-start" />
        Change role
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form className="flex flex-col gap-5" onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Change role</DialogTitle>
            <DialogDescription>
              Choose the role {membership.user.name} will hold in this organization.
            </DialogDescription>
          </DialogHeader>
          {failure ? (
            <Alert variant="destructive" aria-live="polite">
              <AlertDescription>{failure}</AlertDescription>
            </Alert>
          ) : null}
          <FieldGroup>
            <Field data-disabled={pending}>
              <FieldLabel htmlFor={`change-role-${membership.id}`}>Role</FieldLabel>
              <Select
                items={roleItems}
                name="role"
                value={role}
                onValueChange={(value) => {
                  const parsed = roleSchema.safeParse(value);
                  if (parsed.success && roleChoices.includes(parsed.data)) setRole(parsed.data);
                }}
                disabled={pending}
              >
                <SelectTrigger id={`change-role-${membership.id}`} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {roleChoices.map((choice) => (
                      <SelectItem
                        key={choice}
                        value={choice}
                        disabled={Boolean(
                          roleChangeRefusal(callerRole, membership, choice, memberships),
                        )}
                      >
                        {roleLabel(choice)}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
          </FieldGroup>
          <DialogFooter showCloseButton>
            <Button type="submit" disabled={pending || role === membership.role}>
              {pending ? <Spinner data-icon="inline-start" /> : null}
              Save role
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RemoveMembershipDialog({
  membership,
  memberships,
  callerRole,
  organizationId,
}: Readonly<{
  membership: Membership;
  memberships: readonly Membership[];
  callerRole: OrganizationRole;
  organizationId: string;
}>) {
  const router = useRouter();
  const reason = removalRefusal(callerRole, membership, memberships);
  const [open, setOpen] = useState(false);
  const [failure, setFailure] = useState<string>();
  const [pending, setPending] = useState(false);

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    setFailure(undefined);
  }

  async function handleRemove() {
    setFailure(undefined);
    setPending(true);

    let result: Awaited<ReturnType<typeof authClient.organization.removeMember>>;
    try {
      result = await authClient.organization.removeMember({
        memberIdOrEmail: membership.id,
        organizationId,
      });
    } catch {
      setFailure("Could not remove this person.");
      setPending(false);
      return;
    }
    if (result.error) {
      setFailure(removalFailure(result.error.code));
      setPending(false);
      return;
    }

    setPending(false);
    handleOpenChange(false);
    await refreshPeople(router);
  }

  if (reason) {
    return (
      <DisabledReason reason={reason}>
        <Button variant="ghost" size="sm" disabled>
          <UserMinusIcon data-icon="inline-start" />
          Remove
        </Button>
      </DisabledReason>
    );
  }

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogTrigger render={<Button variant="ghost" size="sm" />}>
        <UserMinusIcon data-icon="inline-start" />
        Remove
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove this person?</AlertDialogTitle>
          <AlertDialogDescription>
            {membership.user.name} will lose access to this organization immediately.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {failure ? (
          <Alert variant="destructive" aria-live="polite">
            <AlertDescription>{failure}</AlertDescription>
          </Alert>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={pending}
            onClick={(event) => {
              event.preventDefault();
              void handleRemove();
            }}
          >
            {pending ? <Spinner data-icon="inline-start" /> : null}
            Remove
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
