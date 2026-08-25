import { notFound } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { permission } from "#/server/auth-middleware";
import { vaultIdSchema } from "#/server/ids";
import { releaseFailedDemoBudget, reserveDemoBudgetOrThrow } from "#/server/demo-policy";
import { recordDemoActivity } from "#/server/repositories/demo-environments";
import {
  createVault as createVaultInRepository,
  deleteVault as deleteVaultInRepository,
  listVaults as listVaultsFromRepository,
  updateVault as updateVaultInRepository,
} from "#/server/repositories/vaults";

const createVaultSchema = z.object({
  vaultId: vaultIdSchema,
  name: z.string().trim().min(1),
  description: z.string().trim().optional(),
});

const updateVaultSchema = z.object({
  vaultId: vaultIdSchema,
  name: z.string().trim().min(1),
  description: z.string().trim().nullable(),
});

const deleteVaultSchema = z.object({ vaultId: vaultIdSchema });

export const listVaults = createServerFn({ method: "GET" })
  .middleware([permission({ vault: ["read"] })])
  .handler(({ context }) => listVaultsFromRepository(context.orgId));

export const createVault = createServerFn({ method: "POST" })
  .middleware([permission({ vault: ["create"] })])
  .validator(createVaultSchema)
  .handler(async ({ context, data }) => {
    await reserveDemoBudgetOrThrow(context.demoEnvironmentId, "vault");
    try {
      const created = await createVaultInRepository(context.orgId, {
        id: data.vaultId,
        name: data.name,
        description: data.description || null,
      });
      await recordDemoActivity(context.demoEnvironmentId, "vault", data.vaultId);
      return created;
    } catch (error) {
      await releaseFailedDemoBudget(context.demoEnvironmentId, "vault");
      throw error;
    }
  });

export const updateVault = createServerFn({ method: "POST" })
  .middleware([permission({ vault: ["update"] })])
  .validator(updateVaultSchema)
  .handler(async ({ context, data }) => {
    const updated = await updateVaultInRepository(context.orgId, data.vaultId, {
      name: data.name,
      description: data.description || null,
    });
    if (!updated) throw notFound();
    await recordDemoActivity(context.demoEnvironmentId, "vault", data.vaultId);
    return updated;
  });

export const deleteVault = createServerFn({ method: "POST" })
  .middleware([permission({ vault: ["delete"] })])
  .validator(deleteVaultSchema)
  .handler(async ({ context, data }) => {
    const deleted = await deleteVaultInRepository(context.orgId, data.vaultId);
    if (!deleted) throw notFound();
    await releaseFailedDemoBudget(context.demoEnvironmentId, "vault");
    if (deleted.cascadedLinkCount > 0) {
      await releaseFailedDemoBudget(context.demoEnvironmentId, "link", deleted.cascadedLinkCount);
    }
    return deleted.vault;
  });
