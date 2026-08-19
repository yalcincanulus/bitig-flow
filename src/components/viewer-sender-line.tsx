import { viewerSenderLine } from "#/lib/viewer-sender";

export function ViewerSenderLine({
  senderName,
  organizationName,
}: {
  senderName: string | null;
  organizationName: string;
}) {
  return (
    <p className="mb-6 text-sm text-muted-foreground">
      {senderName ? (
        <>
          <span className="text-foreground">{senderName}</span> at {organizationName}
        </>
      ) : (
        <span className="text-foreground">{viewerSenderLine(senderName, organizationName)}</span>
      )}
    </p>
  );
}
