import { defineRelations } from 'drizzle-orm'

import * as schema from './schema'

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
}))
