import { z } from "zod";

export const userIdSchema = z.uuid().brand<"UserId">();
export type UserId = z.infer<typeof userIdSchema>;

export const organizationIdSchema = z.uuid().brand<"OrganizationId">();
export type OrganizationId = z.infer<typeof organizationIdSchema>;

export const documentIdSchema = z.uuid().brand<"DocumentId">();
export type DocumentId = z.infer<typeof documentIdSchema>;

export const vaultIdSchema = z.uuid().brand<"VaultId">();
export type VaultId = z.infer<typeof vaultIdSchema>;

export const linkIdSchema = z.uuid().brand<"LinkId">();
export type LinkId = z.infer<typeof linkIdSchema>;

export const visitIdSchema = z.uuid().brand<"VisitId">();
export type VisitId = z.infer<typeof visitIdSchema>;

export const visitEventIdSchema = z.uuid().brand<"VisitEventId">();
export type VisitEventId = z.infer<typeof visitEventIdSchema>;
