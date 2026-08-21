import { notFound } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { orgMiddleware, permission } from "#/server/auth-middleware";
import { documentIdSchema, vaultIdSchema } from "#/server/ids";
import {
  addVaultItem as addVaultItemInRepository,
  listVaultItems as listVaultItemsFromRepository,
  removeVaultItem as removeVaultItemInRepository,
  setVaultItemVisibility as setVaultItemVisibilityInRepository,
} from "#/server/repositories/vault-items";

const membershipPairSchema = z.object({
  vaultId: vaultIdSchema,
  documentId: documentIdSchema,
});

const addVaultItemSchema = membershipPairSchema.extend({
  addedAt: z.coerce.date(),
});

const removeVaultItemSchema = membershipPairSchema;

const setVaultItemVisibilitySchema = membershipPairSchema.extend({
  isVisible: z.boolean(),
});

export const listVaultItems = createServerFn({ method: "GET" })
  .middleware([orgMiddleware])
  .handler(({ context }) => listVaultItemsFromRepository(context.orgId));

export const addVaultItem = createServerFn({ method: "POST" })
  .middleware([permission({ vault: ["update"] })])
  .validator(addVaultItemSchema)
  .handler(async ({ context, data }) => {
    const added = await addVaultItemInRepository(context.orgId, data);
    if (!added) throw notFound();
    return added;
  });

export const removeVaultItem = createServerFn({ method: "POST" })
  .middleware([permission({ vault: ["update"] })])
  .validator(removeVaultItemSchema)
  .handler(async ({ context, data }) => {
    const removed = await removeVaultItemInRepository(context.orgId, data);
    if (!removed) throw notFound();
    return removed;
  });

export const setVaultItemVisibility = createServerFn({ method: "POST" })
  .middleware([permission({ vault: ["update"] })])
  .validator(setVaultItemVisibilitySchema)
  .handler(async ({ context, data }) => {
    const updated = await setVaultItemVisibilityInRepository(context.orgId, data);
    if (!updated) throw notFound();
    return updated;
  });
