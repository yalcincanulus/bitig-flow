import { useRouter } from "@tanstack/react-router";
import { UserPlusIcon, XIcon } from "lucide-react";
import { useState, type FormEvent } from "react";

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
import { Field, FieldError, FieldGroup, FieldLabel } from "#/components/ui/field";
import { Input } from "#/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select";
import { Spinner } from "#/components/ui/spinner";
import { roleSchema, type OrganizationRole } from "#/lib/access-control";
import { authClient } from "#/lib/auth-client";
import { invitationRoleChoices, roleLabel } from "#/lib/people";

function invitationFailure(code: string | undefined): string {
  switch (code) {
    case "USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION":
      return "This person already belongs to this organization.";
    case "USER_IS_ALREADY_INVITED_TO_THIS_ORGANIZATION":
      return "This address already has an outstanding invitation.";
    default:
      return "Could not send this invitation.";
  }
}

function cancellationFailure(code: string | undefined): string {
  if (code === "INVITATION_NOT_FOUND") {
    return "This invitation is no longer outstanding.";
  }

  return "Could not cancel this invitation.";
}

async function refreshPeople(router: ReturnType<typeof useRouter>) {
  try {
    await router.invalidate({ sync: true });
  } catch {
    // The mutation has already committed. A reload keeps the list authoritative without telling
    // the caller that an Invitation was not sent or canceled when it was.
    window.location.reload();
  }
}

export function InvitePersonDialog({
  organizationId,
  callerRole,
  demo = false,
}: Readonly<{
  organizationId: string;
  callerRole: OrganizationRole;
  demo?: boolean;
}>) {
  const router = useRouter();
  const roleChoices = invitationRoleChoices(callerRole);
  const roleItems = Object.fromEntries(roleChoices.map((role) => [role, roleLabel(role)]));
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<OrganizationRole>("member");
  const [failure, setFailure] = useState<string>();
  const [pending, setPending] = useState(false);

  if (demo) {
    return (
      <Button disabled>
        <UserPlusIcon data-icon="inline-start" />
        Disabled in demo
      </Button>
    );
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (nextOpen) {
      setEmail("");
      setRole("member");
    }
    setFailure(undefined);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFailure(undefined);
    setPending(true);

    let result: Awaited<ReturnType<typeof authClient.organization.inviteMember>>;
    try {
      result = await authClient.organization.inviteMember({
        email: email.trim(),
        role,
        organizationId,
      });
    } catch {
      setFailure("Could not send this invitation.");
      setPending(false);
      return;
    }
    if (result.error) {
      setFailure(invitationFailure(result.error.code));
      setPending(false);
      return;
    }

    setPending(false);
    handleOpenChange(false);
    await refreshPeople(router);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button />}>
        <UserPlusIcon data-icon="inline-start" />
        Invite a colleague
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form className="flex flex-col gap-5" onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Invite a colleague</DialogTitle>
            <DialogDescription>Choose their email address and role.</DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field data-invalid={Boolean(failure)} data-disabled={pending}>
              <FieldLabel htmlFor="invitation-email">Email address</FieldLabel>
              <Input
                id="invitation-email"
                name="email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                required
                aria-invalid={Boolean(failure)}
                disabled={pending}
              />
              <FieldError>{failure}</FieldError>
            </Field>
            <Field data-disabled={pending}>
              <FieldLabel htmlFor="invitation-role">Role</FieldLabel>
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
                <SelectTrigger id="invitation-role" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {roleChoices.map((choice) => (
                      <SelectItem key={choice} value={choice}>
                        {roleLabel(choice)}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
          </FieldGroup>
          <DialogFooter showCloseButton>
            <Button type="submit" disabled={pending}>
              {pending ? <Spinner data-icon="inline-start" /> : null}
              Send invitation
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function CancelInvitationDialog({
  invitation,
  demo = false,
}: Readonly<{
  invitation: Readonly<{ id: string; email: string }>;
  demo?: boolean;
}>) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [failure, setFailure] = useState<string>();
  const [pending, setPending] = useState(false);

  if (demo) {
    return (
      <Button variant="ghost" size="sm" disabled>
        <XIcon data-icon="inline-start" />
        Disabled in demo
      </Button>
    );
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    setFailure(undefined);
  }

  async function handleCancel() {
    setFailure(undefined);
    setPending(true);

    let result: Awaited<ReturnType<typeof authClient.organization.cancelInvitation>>;
    try {
      result = await authClient.organization.cancelInvitation({
        invitationId: invitation.id,
      });
    } catch {
      setFailure("Could not cancel this invitation.");
      setPending(false);
      return;
    }
    if (result.error) {
      setFailure(cancellationFailure(result.error.code));
      setPending(false);
      return;
    }

    setPending(false);
    handleOpenChange(false);
    await refreshPeople(router);
  }

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogTrigger render={<Button variant="ghost" size="sm" />}>
        <XIcon data-icon="inline-start" />
        Cancel
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Cancel this invitation?</AlertDialogTitle>
          <AlertDialogDescription>
            The link sent to {invitation.email} will stop working immediately.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {failure ? (
          <Alert variant="destructive" aria-live="polite">
            <AlertDescription>{failure}</AlertDescription>
          </Alert>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Keep invitation</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={pending}
            onClick={(event) => {
              event.preventDefault();
              void handleCancel();
            }}
          >
            {pending ? <Spinner data-icon="inline-start" /> : null}
            Cancel invitation
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
