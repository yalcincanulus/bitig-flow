import type { Role } from "better-auth/plugins/access";
import { describe, expect, test } from "vitest";

import { admin, member, owner } from "#/lib/access-control";
import { authClient } from "#/lib/auth-client";

const resourceActions = {
  organization: ["update", "delete"],
  member: ["create", "update", "delete", "read"],
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
      member: ["create", "update", "delete", "read"],
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
      member: ["create", "update", "delete", "read"],
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
      member: ["read"],
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

// The check `usePermission()` sits over. It decides nothing (ADR-0013), but a browser copy that
// answered differently from the server it shares its statements with would hide the wrong controls.
describe("the same matrix as the browser answers it", () => {
  test.each(roleMatrix)("$roleName is answered identically client-side", ({ roleName, role }) => {
    const roleUnderTest = role as Role;

    for (const resource of Object.keys(resourceActions) as Resource[]) {
      for (const action of resourceActions[resource]) {
        expect(
          authClient.organization.checkRolePermission({
            role: roleName,
            permissions: { [resource]: [action] },
          }),
          `${resource}:${action}`,
        ).toBe(roleUnderTest.authorize({ [resource]: [action] }).success);
      }
    }
  });
});
