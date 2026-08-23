import { z } from "zod";

// How the Documents are laid out. It sits on the Documents layout route rather than on the index,
// so that opening a Document keeps it in the URL and coming back reads it again — a layout is a
// preference, and losing it every time you look at something is not what anyone means by it.
export const documentsViewSearchSchema = z.object({
  view: z.enum(["grid", "list"]).optional(),
});

export type DocumentsView = NonNullable<z.infer<typeof documentsViewSearchSchema>["view"]>;

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
