import { Link } from "@tanstack/react-router";
import {
  AtSignIcon,
  CheckIcon,
  ChartNoAxesCombinedIcon,
  CopyIcon,
  EllipsisIcon,
  ExternalLinkIcon,
  FolderClosedIcon,
  GlobeIcon,
  KeyRoundIcon,
  MailCheckIcon,
  PencilIcon,
  PlusIcon,
  PowerIcon,
  RefreshCwIcon,
  TrashIcon,
} from "lucide-react";
import { useState, type FormEvent } from "react";
import { v7 as uuidv7 } from "uuid";

import { DocumentKindIcon } from "#/components/document-kind";
import { LinkTargetPicker } from "#/components/link-target-picker";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu";
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
import { ToggleGroup, ToggleGroupItem } from "#/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "#/components/ui/tooltip";
import { getCollections } from "#/db-collections";
import { linkDeleteWarning } from "#/lib/cascade-delete-copy";
import { pendingLinkSlug, isLinkSlug, linkViewerPath } from "#/lib/link-slug";
import { queueSharePassword } from "#/lib/pending-share-password";
import { sharePasswordRefusal } from "#/lib/share-password";
import { cn } from "#/lib/utils";
import { countLinkVisits } from "#/server/functions/analytics";

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

const gatePresets = [
  { value: "public", label: "Public", icon: GlobeIcon },
  { value: "password", label: "Password", icon: KeyRoundIcon },
  { value: "email", label: "Email", icon: AtSignIcon },
  { value: "verified", label: "Verified", icon: MailCheckIcon },
] as const;

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
  open: openProp,
  onOpenChange,
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
  /** Omit to run the dialog controlled from somewhere else — a menu item, say. */
  triggerLabel?: string;
  triggerVariant?: "default" | "outline";
  triggerSize?: "default" | "sm";
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = openProp ?? uncontrolledOpen;
  const editing = Boolean(link);
  const lockedTargetKey = lockedTarget
    ? "documentId" in lockedTarget
      ? (`document:${lockedTarget.documentId}` as const)
      : (`vault:${lockedTarget.vaultId}` as const)
    : undefined;
  const [target, setTarget] = useState<string>(lockedTargetKey ?? (link ? targetKeyOf(link) : ""));
  const [preset, setPreset] = useState<GatePreset>("public");
  const [alsoPassword, setAlsoPassword] = useState(false);
  const [allowDownload, setAllowDownload] = useState(false);
  const [clearPassword, setClearPassword] = useState(false);
  const [targetError, setTargetError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  function handleOpenChange(nextOpen: boolean) {
    if (openProp === undefined) setUncontrolledOpen(nextOpen);
    onOpenChange?.(nextOpen);
    if (!nextOpen) {
      setTargetError(null);
      setPasswordError(null);
      setClearPassword(false);
      return;
    }
    setTarget(lockedTargetKey ?? (link ? targetKeyOf(link) : ""));
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

    let resolvedTarget = lockedTarget;
    if (!editing && !resolvedTarget) {
      const parsed = parseTargetKey(target);
      if (!parsed) {
        setTargetError("Choose a Document or a Vault.");
        return;
      }
      resolvedTarget = parsed;
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
      const documentId =
        resolvedTarget && "documentId" in resolvedTarget ? resolvedTarget.documentId : null;
      const vaultId = resolvedTarget && "vaultId" in resolvedTarget ? resolvedTarget.vaultId : null;
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
    handleOpenChange(false);
  }

  const showPasswordField = flagsFromPreset(preset).wantsPassword || alsoPassword;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {triggerLabel ? (
        <DialogTrigger render={<Button variant={triggerVariant} size={triggerSize} />}>
          {editing ? (
            <PencilIcon data-icon="inline-start" />
          ) : (
            <PlusIcon data-icon="inline-start" />
          )}
          {triggerLabel}
        </DialogTrigger>
      ) : null}
      <DialogContent className="sm:max-w-lg">
        <form className="flex flex-col gap-5" onSubmit={handleSubmit}>
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
                <LinkTargetPicker
                  id="link-target"
                  documents={documents}
                  vaults={vaults}
                  value={target}
                  onValueChange={(value) => {
                    setTarget(value);
                    setTargetError(null);
                  }}
                  disabled={Boolean(lockedTarget)}
                  invalid={Boolean(targetError)}
                />
                <FieldError>{targetError}</FieldError>
              </Field>
            )}
            <Field>
              <FieldLabel htmlFor="link-name">Name</FieldLabel>
              <Input
                id="link-name"
                name="name"
                defaultValue={link?.name ?? ""}
                placeholder="How you will recognise this Link"
                autoComplete="off"
              />
            </Field>
            <FieldSet>
              <FieldLegend>Gate</FieldLegend>
              <FieldDescription>
                What a Visitor has to satisfy before the Target is shown.
              </FieldDescription>
              <ToggleGroup
                variant="outline"
                spacing={0}
                value={[preset]}
                onValueChange={(value) => {
                  const next = value[0];
                  if (!next) return;
                  setPreset(next as GatePreset);
                  if (next === "password") setAlsoPassword(false);
                }}
                className="w-full"
              >
                {gatePresets.map((option) => {
                  const Icon = option.icon;

                  return (
                    <ToggleGroupItem
                      key={option.value}
                      value={option.value}
                      className="flex-1"
                      aria-label={option.label}
                    >
                      <Icon data-icon="inline-start" />
                      {option.label}
                    </ToggleGroupItem>
                  );
                })}
              </ToggleGroup>
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
                <FieldDescription>
                  This discourages rather than prevents downloading.
                </FieldDescription>
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
              <FieldDescription>Leave empty for a Link that never expires.</FieldDescription>
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

/**
 * The Link's public path, and one click to take it away with you.
 *
 * The path itself is the label, because that is the thing being copied and an owner reads it to
 * tell two Links apart.
 */
export function CopyLinkSlugButton({ slug, className }: { slug: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const path = linkViewerPath(slug);
  const minted = isLinkSlug(slug);

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={!minted}
      className={cn("font-mono", className)}
      aria-label={`Copy ${path}`}
      onClick={() => {
        void navigator.clipboard
          .writeText(new URL(path, window.location.origin).toString())
          .then(() => {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1500);
          });
      }}
    >
      {copied ? <CheckIcon data-icon="inline-start" /> : <CopyIcon data-icon="inline-start" />}
      {minted ? path : "Minting…"}
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
      onClick={() => rotateSlug(link, links, watchPersistence)}
    >
      <RefreshCwIcon data-icon="inline-start" />
      Rotate Slug
    </Button>
  );
}

function rotateSlug(link: LinkRow, links: LinkCollection, watchPersistence: WatchLinkPersistence) {
  const transaction = links.update(link.id, (draft) => {
    draft.slug = pendingLinkSlug;
  });
  watchPersistence(transaction, "Could not rotate the Slug. Your change was rolled back.");
}

function toggleActive(
  link: LinkRow,
  links: LinkCollection,
  watchPersistence: WatchLinkPersistence,
) {
  const transaction = links.update(link.id, (draft) => {
    draft.isActive = !draft.isActive;
  });
  watchPersistence(
    transaction,
    `Could not ${link.isActive ? "deactivate" : "reactivate"} this Link. Your change was rolled back.`,
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
      onClick={() => toggleActive(link, links, watchPersistence)}
    >
      <PowerIcon data-icon="inline-start" />
      {link.isActive ? "Deactivate" : "Reactivate"}
    </Button>
  );
}

/**
 * Everything an owner can do to one Link, behind one control.
 *
 * A Link carries six verbs, and six buttons per row turned a list of Links into a wall of them.
 * The two an owner reaches for constantly — copy the URL, open it — stay in the open; the rest
 * live here, in the order they are needed, with the destructive one last and marked.
 */
export function LinkActionsMenu({
  organizationId,
  organizationName,
  createdBy,
  documents,
  vaults,
  link,
  links,
  watchPersistence,
}: {
  organizationId: string;
  organizationName: string;
  createdBy: string;
  documents: DocumentRow[];
  vaults: VaultRow[];
  link: LinkRow;
  links: LinkCollection;
  watchPersistence: WatchLinkPersistence;
}) {
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="ghost" size="icon-sm" aria-label="Link actions" />}
        >
          <EllipsisIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuGroup>
            <DropdownMenuItem
              render={<Link to="/dashboard/links/$linkId" params={{ linkId: link.id }} />}
            >
              <ExternalLinkIcon />
              Link details
            </DropdownMenuItem>
            <DropdownMenuItem
              render={<Link to="/dashboard/analytics/$linkId" params={{ linkId: link.id }} />}
            >
              <ChartNoAxesCombinedIcon />
              Analytics
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem onClick={() => setEditing(true)}>
              <PencilIcon />
              Edit Link
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => rotateSlug(link, links, watchPersistence)}>
              <RefreshCwIcon />
              Rotate Slug
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => toggleActive(link, links, watchPersistence)}>
              <PowerIcon />
              {link.isActive ? "Deactivate" : "Reactivate"}
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem variant="destructive" onClick={() => setDeleting(true)}>
              <TrashIcon />
              Delete Link
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <LinkWriteDialog
        organizationId={organizationId}
        organizationName={organizationName}
        createdBy={createdBy}
        documents={documents}
        vaults={vaults}
        links={links}
        watchPersistence={watchPersistence}
        link={link}
        open={editing}
        onOpenChange={setEditing}
      />
      <DeleteLinkDialog
        link={link}
        links={links}
        watchPersistence={watchPersistence}
        open={deleting}
        onOpenChange={setDeleting}
      />
    </>
  );
}

/** Opens the Link's public URL in a new tab, so the owner keeps the Dashboard behind them. */
export function OpenLinkButton({ slug }: { slug: string }) {
  const minted = isLinkSlug(slug);

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            nativeButton={false}
            variant="ghost"
            size="icon-sm"
            disabled={!minted}
            aria-label="Open this Link"
            render={
              <a href={linkViewerPath(slug)} target="_blank" rel="noreferrer noopener">
                <ExternalLinkIcon />
              </a>
            }
          />
        }
      />
      <TooltipContent>Open in a new tab</TooltipContent>
    </Tooltip>
  );
}

export function DeleteLinkDialog({
  link,
  links,
  watchPersistence,
  open: openProp,
  onOpenChange,
  showTrigger = true,
}: {
  link: LinkRow;
  links: LinkCollection;
  watchPersistence: WatchLinkPersistence;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  showTrigger?: boolean;
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = openProp ?? uncontrolledOpen;
  const [visitCount, setVisitCount] = useState<number | null>(null);

  function handleOpenChange(next: boolean) {
    if (openProp === undefined) setUncontrolledOpen(next);
    onOpenChange?.(next);
    if (!next) {
      setVisitCount(null);
      return;
    }
    void countLinkVisits({ data: { linkId: link.id } }).then(setVisitCount, () => {});
  }

  function handleDelete() {
    const transaction = links.delete(link.id);
    watchPersistence(transaction, "Could not delete this Link. Your change was rolled back.");
    handleOpenChange(false);
  }

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      {showTrigger && openProp === undefined ? (
        <AlertDialogTrigger render={<Button variant="destructive" size="sm" />}>
          <TrashIcon data-icon="inline-start" />
          Delete
        </AlertDialogTrigger>
      ) : null}
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this Link?</AlertDialogTitle>
          <AlertDialogDescription>{linkDeleteWarning(visitCount)}</AlertDialogDescription>
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

/**
 * What a Link points at, with the kind of thing it is. A Target is either a Document or a Vault
 * and never both, so the icon carries the distinction the reader would otherwise have to infer.
 */
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
        className="inline-flex min-w-0 items-center gap-1.5 hover:underline"
      >
        {document ? (
          <DocumentKindIcon
            kind={document.kind}
            className="size-3.5 shrink-0 text-muted-foreground"
          />
        ) : null}
        <span className="truncate">{document?.title || "Document"}</span>
      </Link>
    );
  }
  if (link.vaultId) {
    const vault = vaults.find((row) => row.id === link.vaultId);

    return (
      <Link
        to="/dashboard/vaults/$vaultId"
        params={{ vaultId: link.vaultId }}
        className="inline-flex min-w-0 items-center gap-1.5 hover:underline"
      >
        <FolderClosedIcon className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="truncate">{vault?.name || "Vault"}</span>
      </Link>
    );
  }
  return <span className="text-muted-foreground">Target</span>;
}
