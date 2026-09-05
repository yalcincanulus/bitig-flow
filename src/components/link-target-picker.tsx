import { FolderClosedIcon } from "lucide-react";
import { useMemo, useState } from "react";

import { DocumentKindIcon } from "#/components/document-kind";
import {
  Combobox,
  ComboboxCollection,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxInput,
  ComboboxItem,
  ComboboxLabel,
  ComboboxList,
  ComboboxTrigger,
} from "#/components/ui/combobox";
import { ToggleGroup, ToggleGroupItem } from "#/components/ui/toggle-group";
import { type DocumentKind } from "#/lib/document-kind";

type TargetKind = DocumentKind | "vault";

type TargetOption = Readonly<{
  key: string;
  label: string;
  kind: TargetKind;
}>;

type TargetGroup = Readonly<{ value: string; items: readonly string[] }>;

const kindOrder = ["markdown", "pdf", "image"] as const;

// The filter row counts, so it says Images where a Badge on one Document says Image. The Documents
// page words its own filters the same way.
const kindFilterLabels: Record<DocumentKind, string> = {
  markdown: "Markdown",
  pdf: "PDF",
  image: "Images",
};

function TargetIcon({ kind }: Readonly<{ kind: TargetKind }>) {
  if (kind === "vault") return <FolderClosedIcon className="text-muted-foreground" />;
  return <DocumentKindIcon kind={kind} className="text-muted-foreground" />;
}

/**
 * The one field where a Link says what it publishes.
 *
 * A plain select asks someone to recognise one name in a list that grows with the Organization,
 * which stops working long before it looks broken. This reads its own list instead: type to narrow
 * it, or press a kind to cut it down first, with Vaults and Documents kept apart so the two never
 * have to be told from each other by name alone.
 */
export function LinkTargetPicker({
  id,
  documents,
  vaults,
  value,
  onValueChange,
  disabled = false,
  invalid = false,
}: Readonly<{
  id: string;
  documents: readonly { id: string; title: string; kind: DocumentKind; status: string }[];
  vaults: readonly { id: string; name: string }[];
  /** A `document:<id>` or `vault:<id>` key, or an empty string for nothing chosen yet. */
  value: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
  invalid?: boolean;
}>) {
  const [kindFilter, setKindFilter] = useState<TargetKind | "all">("all");

  const options = useMemo(() => {
    const entries = new Map<string, TargetOption>();
    for (const vault of vaults) {
      entries.set(`vault:${vault.id}`, {
        key: `vault:${vault.id}`,
        label: vault.name,
        kind: "vault",
      });
    }
    for (const document of documents) {
      if (document.status !== "ready") continue;
      entries.set(`document:${document.id}`, {
        key: `document:${document.id}`,
        label: document.title || "Untitled",
        kind: document.kind,
      });
    }
    return entries;
  }, [documents, vaults]);

  // Only the kinds actually present get a button, so the row never offers a cut that empties the
  // list on purpose.
  const filters = useMemo(() => {
    const present = new Set([...options.values()].map((option) => option.kind));
    const available: { value: TargetKind | "all"; label: string }[] = [
      { value: "all", label: "All" },
    ];
    if (present.has("vault")) available.push({ value: "vault", label: "Vaults" });
    for (const kind of kindOrder) {
      if (present.has(kind)) available.push({ value: kind, label: kindFilterLabels[kind] });
    }
    return available;
  }, [options]);

  const groups = useMemo<TargetGroup[]>(() => {
    const matching = [...options.values()].filter(
      (option) => kindFilter === "all" || option.kind === kindFilter,
    );
    const vaultKeys = matching.filter((option) => option.kind === "vault").map((o) => o.key);
    const documentKeys = matching.filter((option) => option.kind !== "vault").map((o) => o.key);
    const built: TargetGroup[] = [];
    if (vaultKeys.length > 0) built.push({ value: "Vaults", items: vaultKeys });
    if (documentKeys.length > 0) built.push({ value: "Documents", items: documentKeys });
    return built;
  }, [kindFilter, options]);

  const selected = value ? options.get(value) : undefined;

  return (
    <Combobox
      items={groups}
      value={value || null}
      onValueChange={(next) => onValueChange(typeof next === "string" ? next : "")}
      itemToStringLabel={(key: string) => options.get(key)?.label ?? ""}
      disabled={disabled}
      onOpenChange={(open) => {
        if (!open) setKindFilter("all");
      }}
    >
      <ComboboxTrigger
        id={id}
        aria-invalid={invalid}
        className="flex h-7 w-full items-center justify-between gap-1.5 rounded-md border border-input bg-input/20 px-2 py-1.5 text-xs/relaxed whitespace-nowrap transition-colors outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20 dark:bg-input/30 dark:hover:bg-input/50 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40"
      >
        {selected ? (
          <span className="flex min-w-0 items-center gap-1.5">
            <TargetIcon kind={selected.kind} />
            <span className="truncate">{selected.label}</span>
          </span>
        ) : (
          <span className="text-muted-foreground">Choose a document or vault</span>
        )}
      </ComboboxTrigger>
      {/* Sized to the field it drops from, rather than the primitive's slightly wider default. */}
      <ComboboxContent className="w-(--anchor-width) min-w-(--anchor-width)">
        <div className="flex flex-col gap-2 border-b border-border/60 p-2">
          <ComboboxInput
            placeholder="Search documents and vaults"
            aria-label="Search documents and vaults"
            showTrigger={false}
          />
          {filters.length > 2 ? (
            <ToggleGroup
              variant="outline"
              spacing={0}
              size="sm"
              value={[kindFilter]}
              onValueChange={(next) => {
                const chosen = next[0];
                if (chosen) setKindFilter(chosen as TargetKind | "all");
              }}
              aria-label="Filter by kind"
            >
              {filters.map((filter) => (
                <ToggleGroupItem key={filter.value} value={filter.value}>
                  {filter.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          ) : null}
        </div>
        <ComboboxEmpty>No matching document or vault.</ComboboxEmpty>
        <ComboboxList>
          {(group: TargetGroup) => (
            <ComboboxGroup key={group.value} items={group.items}>
              <ComboboxLabel>{group.value}</ComboboxLabel>
              <ComboboxCollection>
                {(key: string) => {
                  const option = options.get(key);
                  if (!option) return null;
                  return (
                    <ComboboxItem key={key} value={key} className="pr-7">
                      <TargetIcon kind={option.kind} />
                      <span className="truncate">{option.label}</span>
                    </ComboboxItem>
                  );
                }}
              </ComboboxCollection>
            </ComboboxGroup>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
