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

export const ac = createAccessControl({
  ...defaultStatements,
  ...applicationStatements,
});

export const owner = ac.newRole({
  ...ownerAc.statements,
  ...applicationStatements,
});

export const admin = ac.newRole({
  ...adminAc.statements,
  ...applicationStatements,
});

export const member = ac.newRole({
  ...memberAc.statements,
  ...applicationStatements,
});

export const roles = { owner, admin, member } as const;
export type PermissionRequest = RoleAuthorizeRequest<typeof ac.statements>;

export const organizationPluginOptions = {
  ac,
  roles,
  teams: { enabled: false },
  dynamicAccessControl: { enabled: false },
} as const;
