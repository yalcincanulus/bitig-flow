import { defineRelations } from "drizzle-orm";

import * as schema from "./schema";

export const relations = defineRelations(schema, (relation) => ({
  session: {
    user: relation.one.user({
      from: relation.session.userId,
      to: relation.user.id,
      optional: false,
    }),
  },
  member: {
    user: relation.one.user({
      from: relation.member.userId,
      to: relation.user.id,
      optional: false,
    }),
    organization: relation.one.organization({
      from: relation.member.organizationId,
      to: relation.organization.id,
      optional: false,
    }),
  },
  invitation: {
    organization: relation.one.organization({
      from: relation.invitation.organizationId,
      to: relation.organization.id,
      optional: false,
    }),
  },
  document: {
    organization: relation.one.organization({
      from: relation.document.organizationId,
      to: relation.organization.id,
      optional: false,
    }),
    creator: relation.one.user({
      from: relation.document.createdBy,
      to: relation.user.id,
      optional: true,
    }),
    vaults: relation.many.vault({
      from: relation.document.id.through(relation.vaultItem.documentId),
      to: relation.vault.id.through(relation.vaultItem.vaultId),
    }),
  },
  vault: {
    organization: relation.one.organization({
      from: relation.vault.organizationId,
      to: relation.organization.id,
      optional: false,
    }),
    documents: relation.many.document({
      from: relation.vault.id.through(relation.vaultItem.vaultId),
      to: relation.document.id.through(relation.vaultItem.documentId),
    }),
  },
}));
