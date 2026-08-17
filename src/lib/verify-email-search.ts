import { z } from "zod";

export const verifyEmailSearchSchema = z.object({
  email: z.email().optional(),
});
