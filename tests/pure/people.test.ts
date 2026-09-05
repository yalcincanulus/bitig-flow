import { describe, expect, test } from "vitest";

import {
  byStanding,
  changeRoleActionRefusal,
  outstandingInvitations,
  readsOutstandingInvitations,
  removalRefusal,
  roleChangeRefusal,
  roleLabel,
} from "#/lib/people";

const now = new Date("2026-08-22T12:00:00.000Z");

function invitation(status: string, expiresAt: string) {
  return { status, expiresAt: new Date(expiresAt) };
}

function membership(role: "owner" | "admin" | "member", name: string) {
  return { role, user: { name } };
}

describe("readsOutstandingInvitations", () => {
  test("an owner and an admin see them, and a member does not", () => {
    expect(readsOutstandingInvitations("owner")).toBe(true);
    expect(readsOutstandingInvitations("admin")).toBe(true);
    expect(readsOutstandingInvitations("member")).toBe(false);
  });
});

describe("roleLabel", () => {
  test("names each Role the way CONTEXT.md does", () => {
    expect(roleLabel("owner")).toBe("Owner");
    expect(roleLabel("admin")).toBe("Admin");
    expect(roleLabel("member")).toBe("Member");
  });
});

describe("outstandingInvitations", () => {
  test("keeps a pending Invitation that has not lapsed", () => {
    const pending = invitation("pending", "2026-08-23T12:00:00.000Z");

    expect(outstandingInvitations([pending], now)).toEqual([pending]);
  });

  // Better Auth never transitions a lapsed Invitation out of `pending` (ADR-0066), so a row nobody
  // can accept any more reads as pending until its expiry is compared against the clock.
  test("drops a pending Invitation whose expiry has passed", () => {
    expect(
      outstandingInvitations([invitation("pending", "2026-08-21T12:00:00.000Z")], now),
    ).toEqual([]);
  });

  test("drops an Invitation that was accepted, canceled, or rejected", () => {
    const spent = [
      invitation("accepted", "2026-08-23T12:00:00.000Z"),
      invitation("canceled", "2026-08-23T12:00:00.000Z"),
      invitation("rejected", "2026-08-23T12:00:00.000Z"),
    ];

    expect(outstandingInvitations(spent, now)).toEqual([]);
  });
});

function withRoles(
  ...roles: Array<"owner" | "admin" | "member">
): Array<{ role: "owner" | "admin" | "member" }> {
  return roles.map((role) => ({ role }));
}

describe("roleChangeRefusal", () => {
  test("an owner can change any Role, including granting Owner", () => {
    const memberships = withRoles("owner", "admin", "member");

    expect(roleChangeRefusal("owner", memberships[2]!, "admin", memberships)).toBeUndefined();
    expect(roleChangeRefusal("owner", memberships[2]!, "owner", memberships)).toBeUndefined();
    expect(roleChangeRefusal("owner", memberships[1]!, "member", memberships)).toBeUndefined();
  });

  test("the last Owner cannot be demoted", () => {
    const memberships = withRoles("owner", "admin");

    expect(roleChangeRefusal("owner", memberships[0]!, "admin", memberships)).toBe(
      "The last owner cannot be demoted.",
    );
  });

  test("an Owner can be demoted when another Owner remains", () => {
    const memberships = withRoles("owner", "owner", "member");

    expect(roleChangeRefusal("owner", memberships[0]!, "admin", memberships)).toBeUndefined();
  });

  test("an admin cannot change an Owner's Role or grant it", () => {
    const memberships = withRoles("owner", "admin", "member");

    expect(roleChangeRefusal("admin", memberships[0]!, "admin", memberships)).toBe(
      "An admin cannot change an owner's role.",
    );
    expect(roleChangeRefusal("admin", memberships[2]!, "owner", memberships)).toBe(
      "Only an owner can make someone else an owner.",
    );
  });

  test("an admin can change a member to admin", () => {
    const memberships = withRoles("owner", "admin", "member");

    expect(roleChangeRefusal("admin", memberships[2]!, "admin", memberships)).toBeUndefined();
  });

  test("a member cannot change a Role", () => {
    const memberships = withRoles("owner", "member");

    expect(roleChangeRefusal("member", memberships[1]!, "admin", memberships)).toBe(
      "You do not have permission to change roles.",
    );
  });
});

describe("removalRefusal", () => {
  test("the last Owner cannot be removed", () => {
    const memberships = withRoles("owner", "admin");

    expect(removalRefusal("owner", memberships[0]!, memberships)).toBe(
      "The last owner cannot be removed.",
    );
  });

  test("an Owner can be removed when another Owner remains", () => {
    const memberships = withRoles("owner", "owner");

    expect(removalRefusal("owner", memberships[1]!, memberships)).toBeUndefined();
  });

  test("an admin cannot remove an Owner", () => {
    const memberships = withRoles("owner", "admin");

    expect(removalRefusal("admin", memberships[0]!, memberships)).toBe(
      "An admin cannot remove an owner.",
    );
  });

  test("an admin can remove a member", () => {
    const memberships = withRoles("owner", "admin", "member");

    expect(removalRefusal("admin", memberships[2]!, memberships)).toBeUndefined();
  });

  test("a member cannot remove a Membership", () => {
    const memberships = withRoles("owner", "member");

    expect(removalRefusal("member", memberships[1]!, memberships)).toBe(
      "You do not have permission to remove people.",
    );
  });
});

describe("changeRoleActionRefusal", () => {
  test("disables the last Owner's demote action with the demotion reason", () => {
    const memberships = withRoles("owner", "member");

    expect(changeRoleActionRefusal("owner", memberships[0]!, memberships)).toBe(
      "The last owner cannot be demoted.",
    );
  });

  test("disables an admin's change action on an Owner", () => {
    const memberships = withRoles("owner", "admin");

    expect(changeRoleActionRefusal("admin", memberships[0]!, memberships)).toBe(
      "An admin cannot change an owner's role.",
    );
  });

  test("leaves the action open when any other Role can still be granted", () => {
    const memberships = withRoles("owner", "admin", "member");

    expect(changeRoleActionRefusal("owner", memberships[2]!, memberships)).toBeUndefined();
    expect(changeRoleActionRefusal("admin", memberships[2]!, memberships)).toBeUndefined();
  });
});

describe("byStanding", () => {
  test("orders owners above admins above members", () => {
    const memberships = [
      membership("member", "Cem"),
      membership("owner", "Ayşe"),
      membership("admin", "Barış"),
    ];

    expect([...memberships].sort(byStanding).map((entry) => entry.role)).toEqual([
      "owner",
      "admin",
      "member",
    ]);
  });

  test("orders people holding the same Role by name", () => {
    const memberships = [
      membership("member", "Zeynep"),
      membership("member", "Ali"),
      membership("member", "Mehmet"),
    ];

    expect([...memberships].sort(byStanding).map((entry) => entry.user.name)).toEqual([
      "Ali",
      "Mehmet",
      "Zeynep",
    ]);
  });
});
