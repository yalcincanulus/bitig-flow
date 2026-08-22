import { createAccessControl } from "better-auth/plugins/access";
import type { RoleAuthorizeRequest } from "better-auth/plugins/access";
import {
  adminAc,
  defaultStatements,
  memberAc,
  ownerAc,
} from "better-auth/plugins/organization/access";

const applicationStatements = {
  document: ["create", "read", "update", "delete"],
  vault: ["create", "read", "update", "delete"],
  link: ["create", "read", "update", "delete"],
  analytics: ["read"],
} as const;

// `read` on better-auth's own `member` resource is ours, and every Role holds it: `listMembers`
// checks no permission, so this is a grant better-auth never consults and our read path asserts.
const memberRead = ["read"] as const;
const memberResourceActions = [...defaultStatements.member, ...memberRead] as const;

export const ac = createAccessControl({
  ...defaultStatements,
  ...applicationStatements,
  member: memberResourceActions,
});

export const owner = ac.newRole({
  ...ownerAc.statements,
  ...applicationStatements,
  member: memberResourceActions,
});

export const admin = ac.newRole({
  ...adminAc.statements,
  ...applicationStatements,
  member: memberResourceActions,
});

export const member = ac.newRole({
  ...memberAc.statements,
  ...applicationStatements,
  member: memberRead,
});

export const roles = { owner, admin, member } as const;
export type PermissionRequest = RoleAuthorizeRequest<typeof ac.statements>;

export const organizationPluginOptions = {
  ac,
  roles,
  teams: { enabled: false },
  dynamicAccessControl: { enabled: false },
} as const;
