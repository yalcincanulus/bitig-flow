import { z } from "zod";

export const documentsSearchSchema = z.object({
  vault: z.uuid().optional(),
  kind: z.enum(["markdown", "pdf", "image"]).optional(),
  q: z.string().trim().max(200).optional(),
});

export const linksSearchSchema = z.object({
  target: z.uuid().optional(),
  status: z.enum(["active", "inactive"]).optional(),
});

export const analyticsRangeSchema = z
  .object({
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
  })
  .refine(({ from, to }) => !from || !to || from <= to, {
    message: "The start date must not be after the end date",
    path: ["to"],
  });
