import type { Role } from "better-auth/plugins/access";
import { describe, expect, test } from "vitest";

import { admin, member, owner } from "#/lib/access-control";

const resourceActions = {
  organization: ["update", "delete"],
  member: ["create", "update", "delete"],
  invitation: ["create", "cancel"],
  document: ["create", "read", "update", "delete"],
  vault: ["create", "read", "update", "delete"],
  link: ["create", "read", "update", "delete"],
  analytics: ["read"],
} as const;

type Resource = keyof typeof resourceActions;

const roleMatrix = [
  {
    roleName: "owner",
    role: owner,
    permissions: {
      organization: ["update", "delete"],
      member: ["create", "update", "delete"],
      invitation: ["create", "cancel"],
      document: ["create", "read", "update", "delete"],
      vault: ["create", "read", "update", "delete"],
      link: ["create", "read", "update", "delete"],
      analytics: ["read"],
    },
  },
  {
    roleName: "admin",
    role: admin,
    permissions: {
      organization: ["update"],
      member: ["create", "update", "delete"],
      invitation: ["create", "cancel"],
      document: ["create", "read", "update", "delete"],
      vault: ["create", "read", "update", "delete"],
      link: ["create", "read", "update", "delete"],
      analytics: ["read"],
    },
  },
  {
    roleName: "member",
    role: member,
    permissions: {
      organization: [],
      member: [],
      invitation: [],
      document: ["create", "read", "update", "delete"],
      vault: ["create", "read", "update", "delete"],
      link: ["create", "read", "update", "delete"],
      analytics: ["read"],
    },
  },
] as const;

describe("the role permission matrix", () => {
  test.each(roleMatrix)(
    "$roleName grants every listed action and denies every unlisted action",
    ({ role, permissions }) => {
      const roleUnderTest = role as Role;

      for (const resource of Object.keys(resourceActions) as Resource[]) {
        const grantedActions = new Set<string>(permissions[resource]);

        expect(role.statements[resource]).toEqual(permissions[resource]);

        for (const action of resourceActions[resource]) {
          expect(
            roleUnderTest.authorize({ [resource]: [action] }).success,
            `${resource}:${action}`,
          ).toBe(grantedActions.has(action));
        }
      }
    },
  );
});
