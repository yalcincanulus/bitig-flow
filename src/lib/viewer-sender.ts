export function viewerSenderLine(senderName: string | null, organizationName: string) {
  return senderName === null ? organizationName : `${senderName} at ${organizationName}`;
}

export function viewerSenderFirstName(senderName: string | null, organizationName: string) {
  if (senderName === null) return organizationName;
  const firstName = senderName.trim().split(/\s+/)[0];
  return firstName || organizationName;
}
