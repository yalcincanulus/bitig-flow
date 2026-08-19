import { Link } from "@tanstack/react-router";
import { CopyIcon, PencilIcon, PlusIcon, RefreshCwIcon, TrashIcon } from "lucide-react";
import { useState, type FormEvent } from "react";
import { v7 as uuidv7 } from "uuid";

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
import { Button } from "#/components/ui/button";
import { Checkbox } from "#/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "#/components/ui/dialog";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "#/components/ui/field";
import { Input } from "#/components/ui/input";
import { getCollections } from "#/db-collections";
import { pendingLinkSlug, isLinkSlug, linkViewerPath } from "#/lib/link-slug";
import { queueSharePassword } from "#/lib/pending-share-password";
import { sharePasswordRefusal } from "#/lib/share-password";

type LinkCollection = ReturnType<typeof getCollections>["links"];
type DocumentCollection = ReturnType<typeof getCollections>["documents"];
type VaultCollection = ReturnType<typeof getCollections>["vaults"];
type LinkRow = NonNullable<ReturnType<LinkCollection["get"]>>;
type DocumentRow = NonNullable<ReturnType<DocumentCollection["get"]>>;
type VaultRow = NonNullable<ReturnType<VaultCollection["get"]>>;

export type WatchLinkPersistence = (
  transaction: ReturnType<LinkCollection["insert"]>,
  message: string,
) => void;

type GatePreset = "public" | "password" | "email" | "verified";

type TargetKey = `document:${string}` | `vault:${string}`;

function textValue(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function presetFromLink(
  link: Pick<LinkRow, "requiresEmail" | "requiresVerification" | "passwordSet">,
) {
  if (link.requiresVerification) return "verified" as const;
  if (link.requiresEmail) return "email" as const;
  if (link.passwordSet) return "password" as const;
  return "public" as const;
}

function flagsFromPreset(preset: GatePreset) {
  return {
    requiresEmail: preset === "email" || preset === "verified",
    requiresVerification: preset === "verified",
    wantsPassword: preset === "password",
  };
}

function parseTargetKey(value: string): { documentId: string } | { vaultId: string } | undefined {
  const [kind, id] = value.split(":");
  if (!id) return undefined;
  if (kind === "document") return { documentId: id };
  if (kind === "vault") return { vaultId: id };
  return undefined;
}

function targetKeyOf(link: Pick<LinkRow, "documentId" | "vaultId">): TargetKey | "" {
  if (link.documentId) return `document:${link.documentId}`;
  if (link.vaultId) return `vault:${link.vaultId}`;
  return "";
}

export function gateSummary(
  link: Pick<LinkRow, "passwordSet" | "requiresEmail" | "requiresVerification">,
) {
  const parts = [];
  if (link.passwordSet) parts.push("Password");
  if (link.requiresVerification) parts.push("Verified email");
  else if (link.requiresEmail) parts.push("Email");
  return parts.length > 0 ? parts.join(" and ") : "Public";
}

export function LinkWriteDialog({
  organizationId,
  organizationName,
  createdBy,
  documents,
  vaults,
  links,
  watchPersistence,
  lockedTarget,
  link,
  triggerLabel,
  triggerVariant = "default",
  triggerSize,
}: {
  organizationId: string;
  organizationName: string;
  createdBy: string;
  documents: DocumentRow[];
  vaults: VaultRow[];
  links: LinkCollection;
  watchPersistence: WatchLinkPersistence;
  lockedTarget?: { documentId: string } | { vaultId: string };
  link?: LinkRow;
  triggerLabel: string;
  triggerVariant?: "default" | "outline";
  triggerSize?: "default" | "sm";
}) {
  const [open, setOpen] = useState(false);
  const [preset, setPreset] = useState<GatePreset>("public");
  const [alsoPassword, setAlsoPassword] = useState(false);
  const [allowDownload, setAllowDownload] = useState(false);
  const [clearPassword, setClearPassword] = useState(false);
  const [targetError, setTargetError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const readyDocuments = documents.filter((document) => document.status === "ready");
  const editing = Boolean(link);

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) {
      setTargetError(null);
      setPasswordError(null);
      setClearPassword(false);
      return;
    }
    if (link) {
      const nextPreset = presetFromLink(link);
      setPreset(nextPreset);
      setAlsoPassword(link.passwordSet && (nextPreset === "email" || nextPreset === "verified"));
      setAllowDownload(link.allowDownload);
    } else {
      setPreset("public");
      setAlsoPassword(false);
      setAllowDownload(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const flags = flagsFromPreset(preset);
    const wantsPassword = flags.wantsPassword || alsoPassword;
    const password = textValue(formData, "password");
    const name = textValue(formData, "name").trim() || null;
    const expiresValue = textValue(formData, "expiresAt");
    const expiresAt = expiresValue ? new Date(expiresValue) : null;

    let target = lockedTarget;
    if (!editing && !target) {
      const parsed = parseTargetKey(textValue(formData, "target"));
      if (!parsed) {
        setTargetError("Choose a Document or a Vault.");
        return;
      }
      target = parsed;
    }

    if (wantsPassword && !editing && !password) {
      setPasswordError("Enter a share password.");
      return;
    }
    if (password) {
      const reason = sharePasswordRefusal(password, organizationName);
      if (reason === "too_short") {
        setPasswordError("Use at least 8 characters.");
        return;
      }
      if (reason === "organization_name") {
        setPasswordError("Do not use the Organization name.");
        return;
      }
      if (reason === "denied") {
        setPasswordError("Choose a stronger password.");
        return;
      }
    }

    const now = new Date();
    const requiresEmail = flags.requiresEmail;
    const requiresVerification = flags.requiresVerification;

    if (link) {
      if (password) queueSharePassword(link.id, password);
      else if (!wantsPassword && link.passwordSet) queueSharePassword(link.id, null);
      else if (clearPassword && link.passwordSet) queueSharePassword(link.id, null);

      const transaction = links.update(link.id, (draft) => {
        draft.name = name;
        draft.requiresEmail = requiresEmail;
        draft.requiresVerification = requiresVerification;
        draft.allowDownload = allowDownload;
        draft.expiresAt = expiresAt;
        if (password) draft.passwordSet = true;
        else if (!wantsPassword || clearPassword) draft.passwordSet = false;
      });
      watchPersistence(transaction, `Could not update this Link. Your change was rolled back.`);
    } else {
      const documentId = target && "documentId" in target ? target.documentId : null;
      const vaultId = target && "vaultId" in target ? target.vaultId : null;
      const linkId = uuidv7();
      if (wantsPassword) queueSharePassword(linkId, password);

      const transaction = links.insert({
        id: linkId,
        organizationId,
        documentId,
        vaultId,
        slug: pendingLinkSlug,
        name,
        passwordSet: wantsPassword,
        requiresEmail,
        requiresVerification,
        gateVersion: 1,
        allowDownload,
        expiresAt,
        isActive: true,
        createdBy,
        createdAt: now,
        updatedAt: now,
      });
      watchPersistence(transaction, "Could not create the Link. Your change was rolled back.");
    }

    setTargetError(null);
    setPasswordError(null);
    setOpen(false);
  }

  const showPasswordField = flagsFromPreset(preset).wantsPassword || alsoPassword;
  const defaultTarget = lockedTarget
    ? "documentId" in lockedTarget
      ? `document:${lockedTarget.documentId}`
      : `vault:${lockedTarget.vaultId}`
    : link
      ? targetKeyOf(link)
      : "";

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button variant={triggerVariant} size={triggerSize} />}>
        {editing ? <PencilIcon data-icon="inline-start" /> : <PlusIcon data-icon="inline-start" />}
        {triggerLabel}
      </DialogTrigger>
      <DialogContent>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Link" : "Create Link"}</DialogTitle>
            <DialogDescription>
              {editing
                ? "Change the Gate, name, or options. Replacing a password re-gates live Visits."
                : "Publish a Document or a Vault. The Slug is minted on the server."}
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            {editing ? null : (
              <Field data-invalid={Boolean(targetError)}>
                <FieldLabel htmlFor="link-target">Target</FieldLabel>
                <select
                  id="link-target"
                  name="target"
                  defaultValue={defaultTarget}
                  required
                  disabled={Boolean(lockedTarget)}
                  className="h-8 rounded-md border border-input bg-transparent px-2 text-sm"
                  aria-invalid={Boolean(targetError)}
                >
                  <option value="">Choose a Document or Vault</option>
                  {readyDocuments.map((document) => (
                    <option key={document.id} value={`document:${document.id}`}>
                      Document: {document.title || "Untitled"}
                    </option>
                  ))}
                  {vaults.map((vault) => (
                    <option key={vault.id} value={`vault:${vault.id}`}>
                      Vault: {vault.name}
                    </option>
                  ))}
                </select>
                <FieldError>{targetError}</FieldError>
              </Field>
            )}
            <Field>
              <FieldLabel htmlFor="link-name">Name</FieldLabel>
              <Input
                id="link-name"
                name="name"
                defaultValue={link?.name ?? ""}
                autoComplete="off"
              />
            </Field>
            <FieldSet>
              <FieldLegend>Gate</FieldLegend>
              {(
                [
                  ["public", "Public"],
                  ["password", "Password"],
                  ["email", "Email capture"],
                  ["verified", "Email verified"],
                ] as const
              ).map(([value, label]) => (
                <Field key={value} orientation="horizontal">
                  <input
                    id={`link-preset-${value}`}
                    type="radio"
                    name="preset"
                    checked={preset === value}
                    onChange={() => {
                      setPreset(value);
                      if (value === "password") setAlsoPassword(false);
                    }}
                  />
                  <FieldLabel htmlFor={`link-preset-${value}`}>{label}</FieldLabel>
                </Field>
              ))}
            </FieldSet>
            {preset === "email" || preset === "verified" ? (
              <Field orientation="horizontal">
                <Checkbox
                  id="link-also-password"
                  checked={alsoPassword}
                  onCheckedChange={(checked) => setAlsoPassword(checked === true)}
                />
                <FieldContent>
                  <FieldLabel htmlFor="link-also-password">Also require a password</FieldLabel>
                </FieldContent>
              </Field>
            ) : null}
            {showPasswordField ? (
              <Field data-invalid={Boolean(passwordError)}>
                <FieldLabel htmlFor="link-password">
                  {editing && link?.passwordSet ? "Replace password" : "Password"}
                </FieldLabel>
                <Input
                  id="link-password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  aria-invalid={Boolean(passwordError)}
                />
                <FieldDescription>
                  At least 8 characters. Never shown again after you save.
                </FieldDescription>
                <FieldError>{passwordError}</FieldError>
              </Field>
            ) : null}
            {editing && link?.passwordSet && !showPasswordField ? (
              <Field orientation="horizontal">
                <Checkbox
                  id="link-clear-password"
                  checked={clearPassword}
                  onCheckedChange={(checked) => setClearPassword(checked === true)}
                />
                <FieldContent>
                  <FieldLabel htmlFor="link-clear-password">Clear the share password</FieldLabel>
                </FieldContent>
              </Field>
            ) : null}
            <Field orientation="horizontal">
              <Checkbox
                id="link-allow-download"
                checked={allowDownload}
                onCheckedChange={(checked) => setAllowDownload(checked === true)}
              />
              <FieldContent>
                <FieldLabel htmlFor="link-allow-download">Allow download</FieldLabel>
              </FieldContent>
            </Field>
            <Field>
              <FieldLabel htmlFor="link-expires">Expires</FieldLabel>
              <Input
                id="link-expires"
                name="expiresAt"
                type="datetime-local"
                defaultValue={
                  link?.expiresAt
                    ? new Date(
                        link.expiresAt.getTime() - link.expiresAt.getTimezoneOffset() * 60_000,
                      )
                        .toISOString()
                        .slice(0, 16)
                    : ""
                }
              />
            </Field>
          </FieldGroup>
          <DialogFooter showCloseButton>
            <Button type="submit">{editing ? "Save changes" : "Create Link"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function CopyLinkSlugButton({ slug }: { slug: string }) {
  const [copied, setCopied] = useState(false);
  const path = linkViewerPath(slug);

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={!isLinkSlug(slug)}
      onClick={() => {
        void navigator.clipboard.writeText(path).then(() => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1500);
        });
      }}
    >
      <CopyIcon data-icon="inline-start" />
      {copied ? "Copied" : path}
    </Button>
  );
}

export function RotateLinkSlugButton({
  link,
  links,
  watchPersistence,
}: {
  link: LinkRow;
  links: LinkCollection;
  watchPersistence: WatchLinkPersistence;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => {
        const transaction = links.update(link.id, (draft) => {
          draft.slug = pendingLinkSlug;
        });
        watchPersistence(transaction, "Could not rotate the Slug. Your change was rolled back.");
      }}
    >
      <RefreshCwIcon data-icon="inline-start" />
      Rotate Slug
    </Button>
  );
}

export function ToggleLinkActiveButton({
  link,
  links,
  watchPersistence,
}: {
  link: LinkRow;
  links: LinkCollection;
  watchPersistence: WatchLinkPersistence;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => {
        const transaction = links.update(link.id, (draft) => {
          draft.isActive = !draft.isActive;
        });
        watchPersistence(
          transaction,
          `Could not ${link.isActive ? "deactivate" : "reactivate"} this Link. Your change was rolled back.`,
        );
      }}
    >
      {link.isActive ? "Deactivate" : "Reactivate"}
    </Button>
  );
}

export function DeleteLinkDialog({
  link,
  links,
  watchPersistence,
}: {
  link: LinkRow;
  links: LinkCollection;
  watchPersistence: WatchLinkPersistence;
}) {
  const [open, setOpen] = useState(false);

  function handleDelete() {
    const transaction = links.delete(link.id);
    watchPersistence(transaction, "Could not delete this Link. Your change was rolled back.");
    setOpen(false);
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger render={<Button variant="destructive" size="sm" />}>
        <TrashIcon data-icon="inline-start" />
        Delete
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this Link?</AlertDialogTitle>
          <AlertDialogDescription>
            This removes the Link and its Visits. The old Slug can be used again.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={handleDelete}>
            Delete Link
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function LinkTargetLabel({
  link,
  documents,
  vaults,
}: {
  link: Pick<LinkRow, "documentId" | "vaultId">;
  documents: DocumentRow[];
  vaults: VaultRow[];
}) {
  if (link.documentId) {
    const document = documents.find((row) => row.id === link.documentId);
    return (
      <Link
        to="/dashboard/documents/$documentId"
        params={{ documentId: link.documentId }}
        className="hover:underline"
      >
        {document?.title || "Document"}
      </Link>
    );
  }
  if (link.vaultId) {
    const vault = vaults.find((row) => row.id === link.vaultId);
    return (
      <Link
        to="/dashboard/vaults/$vaultId"
        params={{ vaultId: link.vaultId }}
        className="hover:underline"
      >
        {vault?.name || "Vault"}
      </Link>
    );
  }
  return "Target";
}
