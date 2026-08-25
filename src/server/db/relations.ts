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
  twoFactor: {
    user: relation.one.user({
      from: relation.twoFactor.userId,
      to: relation.user.id,
      optional: false,
    }),
  },
  platformOperator: {
    user: relation.one.user({
      from: relation.platformOperator.userId,
      to: relation.user.id,
      optional: false,
    }),
  },
  demoSampleResource: {
    environment: relation.one.demoEnvironment({
      from: relation.demoSampleResource.environmentId,
      to: relation.demoEnvironment.id,
      optional: false,
    }),
    document: relation.one.document({
      from: relation.demoSampleResource.documentId,
      to: relation.document.id,
      optional: true,
    }),
    vault: relation.one.vault({
      from: relation.demoSampleResource.vaultId,
      to: relation.vault.id,
      optional: true,
    }),
    link: relation.one.link({
      from: relation.demoSampleResource.linkId,
      to: relation.link.id,
      optional: true,
    }),
  },
  demoProvisioningAttempt: {
    user: relation.one.user({
      from: relation.demoProvisioningAttempt.userId,
      to: relation.user.id,
      optional: true,
    }),
    organization: relation.one.organization({
      from: relation.demoProvisioningAttempt.organizationId,
      to: relation.organization.id,
      optional: true,
    }),
    environment: relation.one.demoEnvironment({
      from: relation.demoProvisioningAttempt.environmentId,
      to: relation.demoEnvironment.id,
      optional: true,
    }),
  },
  operatorAuditRecord: {
    operator: relation.one.user({
      from: relation.operatorAuditRecord.operatorUserId,
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
    updater: relation.one.user({
      from: relation.document.updatedBy,
      to: relation.user.id,
      optional: true,
    }),
    vaults: relation.many.vault({
      from: relation.document.id.through(relation.vaultItem.documentId),
      to: relation.vault.id.through(relation.vaultItem.vaultId),
    }),
    links: relation.many.link({
      from: relation.document.id,
      to: relation.link.documentId,
    }),
    referencedDocuments: relation.many.document({
      from: relation.document.id.through(relation.documentReference.sourceDocumentId),
      to: relation.document.id.through(relation.documentReference.targetDocumentId),
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
  link: {
    organization: relation.one.organization({
      from: relation.link.organizationId,
      to: relation.organization.id,
      optional: false,
    }),
    document: relation.one.document({
      from: relation.link.documentId,
      to: relation.document.id,
      optional: true,
    }),
    vault: relation.one.vault({
      from: relation.link.vaultId,
      to: relation.vault.id,
      optional: true,
    }),
    creator: relation.one.user({
      from: relation.link.createdBy,
      to: relation.user.id,
      optional: true,
    }),
  },
  visit: {
    link: relation.one.link({
      from: relation.visit.linkId,
      to: relation.link.id,
      optional: false,
    }),
    events: relation.many.visitEvent({
      from: relation.visit.id,
      to: relation.visitEvent.visitId,
    }),
  },
  visitEvent: {
    visit: relation.one.visit({
      from: relation.visitEvent.visitId,
      to: relation.visit.id,
      optional: false,
    }),
    document: relation.one.document({
      from: relation.visitEvent.documentId,
      to: relation.document.id,
      optional: true,
    }),
  },
}));
