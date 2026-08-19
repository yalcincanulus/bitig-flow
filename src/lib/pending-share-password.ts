const pending = new Map<string, string | null>();

export function queueSharePassword(linkId: string, password: string | null) {
  pending.set(linkId, password);
}

export function takeSharePassword(linkId: string) {
  const password = pending.get(linkId);
  pending.delete(linkId);
  return password;
}
