import { z } from "zod";

import { invitationRedirectSchema } from "#/lib/auth-redirect";

export const verifyEmailSearchSchema = z
  .object({
    email: z.email().optional(),
    redirect: invitationRedirectSchema.optional(),
  })
  .catch({ email: undefined, redirect: undefined });
