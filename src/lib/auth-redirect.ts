import { z } from "zod";

export const invitationRedirectSchema = z.string().refine((value) => {
  const prefix = "/accept-invitation/";
  return value.startsWith(prefix) && z.uuid().safeParse(value.slice(prefix.length)).success;
});

export const authRedirectSearchSchema = z
  .object({ redirect: invitationRedirectSchema.optional() })
  .catch({ redirect: undefined });

export function invitationRedirectPath(invitationId: string) {
  return `/accept-invitation/${encodeURIComponent(invitationId)}`;
}
