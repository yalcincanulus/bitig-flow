import { cn } from "#/lib/utils";

export function ViewerSenderLine({
  senderName,
  organizationName,
  share,
}: {
  senderName: string | null;
  organizationName: string;
  share?: "document" | "vault";
}) {
  return (
    <p className={cn("mb-6 text-muted-foreground", share ? "text-base" : "text-sm")}>
      {senderName ? (
        <>
          <span className="text-foreground">{senderName}</span> at {organizationName}
        </>
      ) : (
        <span className="text-foreground">{organizationName}</span>
      )}
      {share === "vault"
        ? " shared these documents with you."
        : share === "document"
          ? " shared this document with you."
          : null}
    </p>
  );
}
