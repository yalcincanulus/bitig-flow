import { createAccessControl } from "better-auth/plugins/access";
import type { RoleAuthorizeRequest } from "better-auth/plugins/access";
import { z } from "zod";
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

/**
 * A **Role**, parsed rather than trusted.
 *
 * Better Auth stores `member.role` as a free string, and ADR-0010 fixes what we do about it: an
 * unexpected value throws as a data-integrity failure instead of quietly reading as the lowest
 * standing, because a silent downgrade turns a corrupted row into a permissions bug nobody traces.
 */
export const roleSchema = z.enum(["owner", "admin", "member"]);
export type OrganizationRole = z.infer<typeof roleSchema>;

// The `satisfies` is what fails the build if the vocabulary above and the Roles below ever name
// different things.
export const roles = { owner, admin, member } as const satisfies Record<OrganizationRole, unknown>;
export type PermissionRequest = RoleAuthorizeRequest<typeof ac.statements>;

/**
 * Whether a **Role** grants the requested actions.
 *
 * The one place the statements are evaluated, so the server's `permission()` tier and the Dashboard
 * controls that hide themselves cannot answer the same question differently. Which of the two is
 * the enforcement point is settled by ADR-0013, and it is never the browser's copy.
 */
export function hasPermission(role: OrganizationRole, request: PermissionRequest): boolean {
  return roles[role].authorize(request).success;
}

export const organizationPluginOptions = {
  ac,
  roles,
  teams: { enabled: false },
  dynamicAccessControl: { enabled: false },
} as const;
