import { describe, expect, test } from "vitest";

import {
  byStanding,
  outstandingInvitations,
  readsOutstandingInvitations,
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
