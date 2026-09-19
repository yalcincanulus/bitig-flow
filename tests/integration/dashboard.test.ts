import { and, eq } from "drizzle-orm";
import { expect } from "vitest";

import { member as membershipTable, visit, visitEvent } from "#/server/db/schema";

import { dashboardDestinations } from "#/lib/dashboard-destinations";

import {
  createFixtureDocument,
  createFixtureLink,
  createFixtureVault,
  createFixtureUploadedDocument,
  createFixtureUser,
  createOrganizationForFixtureUser,
  createOrganizationFixture,
  database,
  readUploadSample,
} from "../fixtures";
import { callServerFunction } from "../fixtures/http";
import { test } from "./http";

function serverRenderedMarkupOf(html: string) {
  return html.replaceAll(/<script[\s\S]*?<\/script>/g, "");
}

// The sidebar destination is an anchor, so scoping assertions to it keeps them about the
// destination the User sees rather than about anything else the Chrome happens to render.
function navigationLink(markup: string, label: string) {
  const anchors = markup.match(/<a\b[\s\S]*?<\/a>/g) ?? [];

  return anchors.find((anchor) => anchor.includes(`>${label}</span>`)) ?? "";
}

// The toolbar's breadcrumbs and the sidebar both point at the same destinations, so assertions
// about the trail have to look at the breadcrumb nav alone.
function breadcrumbTrail(markup: string) {
  return /<nav[^>]*aria-label="breadcrumb"[\s\S]*?<\/nav>/.exec(markup)?.[0] ?? "";
}

function sidebarTrigger(markup: string) {
  return (
    (markup.match(/<button\b[\s\S]*?<\/button>/g) ?? []).find((button) =>
      button.includes("Toggle sidebar"),
    ) ?? ""
  );
}

async function expectSignInRedirect(response: Response) {
  expect(response.status).toBe(307);
  expect(response.headers.get("location")).toBe("/sign-in");
  expect(await response.text()).toBe("");
}

test("an anonymous Dashboard document request redirects to sign in before rendering", async ({
  http,
}) => {
  const response = await http(new URL("/dashboard/documents", process.env.BETTER_AUTH_URL), {
    redirect: "manual",
  });

  await expectSignInRedirect(response);
});

test("an Organization member receives server-rendered Chrome but no Document pane data", async () => {
  const fixture = await createOrganizationFixture();
  const fixtureDocument = await createFixtureDocument({
    organizationId: fixture.organization.id,
    createdBy: fixture.member.user.id,
  });

  const response = await fixture.member.http(
    new URL("/dashboard/documents", process.env.BETTER_AUTH_URL),
    { redirect: "manual" },
  );
  const html = await response.text();
  const serverRenderedMarkup = serverRenderedMarkupOf(html);

  expect(response.status).toBe(200);
  expect(serverRenderedMarkup).toContain('data-slot="sidebar"');
  expect(serverRenderedMarkup).toContain('data-slot="skeleton"');
  expect(serverRenderedMarkup).toContain('aria-label="Loading dashboard"');
  expect(serverRenderedMarkup).toContain(fixture.member.user.name);
  expect(serverRenderedMarkup).toContain(fixture.organization.name);
  expect(serverRenderedMarkup).not.toContain(">Documents</h1>");
  expect(html).not.toContain(fixtureDocument.title);
});

test("the server-rendered Chrome carries the primary navigation and its destinations", async () => {
  const fixture = await createOrganizationFixture();

  const response = await fixture.member.http(
    new URL("/dashboard/documents", process.env.BETTER_AUTH_URL),
    { redirect: "manual" },
  );
  const html = await response.text();
  const serverRenderedMarkup = serverRenderedMarkupOf(html);

  expect(response.status).toBe(200);
  expect(serverRenderedMarkup).toContain('aria-label="Dashboard"');

  for (const [label, href] of [
    ["Home", "/dashboard"],
    ["Documents", "/dashboard/documents"],
    ["Vaults", "/dashboard/vaults"],
    ["Links", "/dashboard/links"],
    ["Analytics", "/dashboard/analytics"],
    ["Settings", "/dashboard/settings"],
  ]) {
    expect(serverRenderedMarkup, `${label} destination`).toContain(`href="${href}"`);
    expect(serverRenderedMarkup, `${label} label`).toContain(`>${label}</span>`);
  }

  // Home comes first, followed by the resource destinations.
  const positions = ["Home", "Documents", "Vaults", "Links", "Analytics", "Settings"].map((label) =>
    serverRenderedMarkup.indexOf(`>${label}</span>`),
  );
  expect(positions).toEqual([...positions].sort((left, right) => left - right));

  // The list route is the current page, and no other destination claims to be.
  expect(navigationLink(serverRenderedMarkup, "Documents")).toContain('aria-current="page"');
  expect(navigationLink(serverRenderedMarkup, "Home")).not.toContain('aria-current="page"');
  expect(navigationLink(serverRenderedMarkup, "Vaults")).not.toContain('aria-current="page"');
});

test("a Document detail route keeps Documents the current navigation destination", async () => {
  const fixture = await createOrganizationFixture();
  const fixtureDocument = await createFixtureDocument({
    organizationId: fixture.organization.id,
    createdBy: fixture.member.user.id,
  });

  const response = await fixture.member.http(
    new URL(`/dashboard/documents/${fixtureDocument.id}`, process.env.BETTER_AUTH_URL),
    { redirect: "manual" },
  );
  const serverRenderedMarkup = serverRenderedMarkupOf(await response.text());

  expect(response.status).toBe(200);
  expect(navigationLink(serverRenderedMarkup, "Documents")).toContain('aria-current="page"');
});

test("a Vault detail route keeps Vaults the current navigation destination", async () => {
  const fixture = await createOrganizationFixture();
  const fixtureVault = await createFixtureVault({ organizationId: fixture.organization.id });

  const response = await fixture.member.http(
    new URL(`/dashboard/vaults/${fixtureVault.id}`, process.env.BETTER_AUTH_URL),
    { redirect: "manual" },
  );
  const serverRenderedMarkup = serverRenderedMarkupOf(await response.text());

  expect(response.status).toBe(200);
  expect(navigationLink(serverRenderedMarkup, "Vaults")).toContain('aria-current="page"');
});

test("a Link detail route keeps Links the current navigation destination", async () => {
  const fixture = await createOrganizationFixture();
  const fixtureDocument = await createFixtureDocument({
    organizationId: fixture.organization.id,
    createdBy: fixture.member.user.id,
  });
  const fixtureLink = await createFixtureLink({
    organizationId: fixture.organization.id,
    createdBy: fixture.member.user.id,
    documentId: fixtureDocument.id,
  });

  const response = await fixture.member.http(
    new URL(`/dashboard/links/${fixtureLink.id}`, process.env.BETTER_AUTH_URL),
    { redirect: "manual" },
  );
  const serverRenderedMarkup = serverRenderedMarkupOf(await response.text());

  expect(response.status).toBe(200);
  expect(navigationLink(serverRenderedMarkup, "Links")).toContain('aria-current="page"');
});

test("the User menu names the signed-in User", async () => {
  const fixture = await createOrganizationFixture();

  const response = await fixture.member.http(
    new URL("/dashboard/documents", process.env.BETTER_AUTH_URL),
    { redirect: "manual" },
  );
  const serverRenderedMarkup = serverRenderedMarkupOf(await response.text());

  expect(response.status).toBe(200);
  expect(serverRenderedMarkup).toContain(`aria-label="User menu for ${fixture.member.user.name}"`);
  expect(serverRenderedMarkup).toContain(fixture.member.user.name);
  expect(serverRenderedMarkup).toContain(fixture.member.user.email);
});

test("the Dashboard index renders Home without redirecting", async () => {
  const fixture = await createOrganizationFixture();

  for (const path of ["/dashboard", "/dashboard/"]) {
    const response = await fixture.member.http(new URL(path, process.env.BETTER_AUTH_URL), {
      redirect: "manual",
    });
    if (path.endsWith("/")) {
      expect(response.status).toBe(307);
      expect(response.headers.get("location")).toBe("/dashboard");
      continue;
    }
    const markup = serverRenderedMarkupOf(await response.text());

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
    expect(navigationLink(markup, "Home")).toContain('aria-current="page"');
    expect(navigationLink(markup, "Documents")).not.toContain('aria-current="page"');
    expect(breadcrumbTrail(markup)).toContain("Home");
    expect(markup).toContain('aria-label="Loading dashboard"');
  }
});

test("an authenticated User can list every Organization they belong to", async () => {
  const fixture = await createOrganizationFixture();
  const otherOrganization = await createOrganizationForFixtureUser(fixture.member.user.id);

  const response = await callServerFunction(fixture.member.http, {
    modulePath: "/src/server/functions/auth.ts",
    exportName: "listOrganizations",
    method: "GET",
  });

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: fixture.organization.id, name: fixture.organization.name }),
      expect.objectContaining({ id: otherOrganization.id, name: otherOrganization.name }),
    ]),
  );
});

test("no memberships and eviction send Dashboard requests to onboarding", async () => {
  const userWithoutMemberships = await createFixtureUser();
  const organizationFixture = await createOrganizationFixture();

  await database
    .delete(membershipTable)
    .where(
      and(
        eq(membershipTable.userId, organizationFixture.member.user.id),
        eq(membershipTable.organizationId, organizationFixture.organization.id),
      ),
    );

  const responses = await Promise.all(
    [userWithoutMemberships.http, organizationFixture.member.http].map((http) =>
      http(new URL("/dashboard/documents", process.env.BETTER_AUTH_URL), {
        redirect: "manual",
      }),
    ),
  );

  for (const response of responses) {
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("/onboarding");
    expect(await response.text()).toBe("");
  }
});

test("a User with memberships and no active Organization still reaches the Dashboard", async () => {
  const fixture = await createFixtureUser();
  const organization = await createOrganizationForFixtureUser(fixture.user.id);

  const response = await fixture.http(
    new URL("/dashboard/documents", process.env.BETTER_AUTH_URL),
    { redirect: "manual" },
  );
  const html = await response.text();

  expect(response.status).toBe(200);
  expect(html).toContain(organization.name);
  expect(html).toContain(fixture.user.name);
});

test("the server-rendered Chrome carries the toolbar, its sidebar trigger, and breadcrumbs", async () => {
  const fixture = await createOrganizationFixture();

  const response = await fixture.member.http(
    new URL("/dashboard/vaults", process.env.BETTER_AUTH_URL),
    { redirect: "manual" },
  );
  const serverRenderedMarkup = serverRenderedMarkupOf(await response.text());
  const trail = breadcrumbTrail(serverRenderedMarkup);

  expect(response.status).toBe(200);
  expect(serverRenderedMarkup).toContain('data-slot="sidebar-trigger"');
  expect(serverRenderedMarkup).toContain("Toggle sidebar");
  // The trigger is icon-only, so whether the sidebar is open has to be on the control itself.
  expect(sidebarTrigger(serverRenderedMarkup)).toContain('aria-expanded="true"');

  // The destination a User is on is the current page, and it hangs from nothing above it.
  expect(trail).toContain(">Vaults</span>");
  expect(trail).toContain('data-slot="breadcrumb-page"');
  expect(trail).not.toContain("Overview");
  expect(trail).not.toContain('href="/dashboard/vaults"');
});

test("a Document Preview breadcrumb hangs the Document under a navigable Documents", async () => {
  const fixture = await createOrganizationFixture();
  const fixtureDocument = await createFixtureDocument({
    organizationId: fixture.organization.id,
    createdBy: fixture.member.user.id,
  });

  const response = await fixture.member.http(
    new URL(`/dashboard/documents/${fixtureDocument.id}`, process.env.BETTER_AUTH_URL),
    { redirect: "manual" },
  );
  const trail = breadcrumbTrail(serverRenderedMarkupOf(await response.text()));

  expect(response.status).toBe(200);
  // The Document title belongs to the client-only pane, so the Chrome names the kind until then.
  expect(trail).toContain('href="/dashboard/documents"');
  expect(trail).toContain(">Documents</a>");
  expect(trail).toContain(">Document</span>");
  // A uuid tells a User nothing, so the Document crumb never falls back to one.
  expect(trail).not.toContain(fixtureDocument.id);
  // Only the Document itself is the current page; the Documents ancestor above it is not.
  expect(trail.match(/aria-current="page"/g)).toHaveLength(1);
});

test("the editor breadcrumb keeps the Document between Documents and Edit", async () => {
  const fixture = await createOrganizationFixture();
  const fixtureDocument = await createFixtureDocument({
    organizationId: fixture.organization.id,
    createdBy: fixture.member.user.id,
  });

  const response = await fixture.member.http(
    new URL(`/dashboard/documents/${fixtureDocument.id}/edit`, process.env.BETTER_AUTH_URL),
    { redirect: "manual" },
  );
  const trail = breadcrumbTrail(serverRenderedMarkupOf(await response.text()));

  expect(response.status).toBe(200);
  expect(trail).toContain('href="/dashboard/documents"');
  expect(trail).toContain(`href="/dashboard/documents/${fixtureDocument.id}"`);
  expect(trail).toContain(">Edit</span>");
  expect(trail.match(/aria-current="page"/g)).toHaveLength(1);
});

test("a Vault detail breadcrumb hangs the Vault under a navigable Vaults", async () => {
  const fixture = await createOrganizationFixture();
  const fixtureVault = await createFixtureVault({ organizationId: fixture.organization.id });

  const response = await fixture.member.http(
    new URL(`/dashboard/vaults/${fixtureVault.id}`, process.env.BETTER_AUTH_URL),
    { redirect: "manual" },
  );
  const trail = breadcrumbTrail(serverRenderedMarkupOf(await response.text()));

  expect(response.status).toBe(200);
  expect(trail).toContain('href="/dashboard/vaults"');
  expect(trail).toContain(">Vault</span>");
  expect(trail).not.toContain(fixtureVault.id);
});

test("every Role can reach Links, Analytics, and Settings", async () => {
  const fixture = await createOrganizationFixture();
  const destinations = [
    dashboardDestinations.links,
    dashboardDestinations.analytics,
    dashboardDestinations.settings,
  ];

  for (const role of ["owner", "admin", "member"] as const) {
    for (const destination of destinations) {
      const path = destination.link.to;
      const response = await fixture[role].http(new URL(path, process.env.BETTER_AUTH_URL), {
        redirect: "manual",
      });
      const serverRenderedMarkup = serverRenderedMarkupOf(await response.text());

      expect(response.status, `${role} ${path}`).toBe(200);
      expect(serverRenderedMarkup, `${role} ${path}`).toContain('data-slot="sidebar"');
      expect(navigationLink(serverRenderedMarkup, destination.label)).toContain(
        'aria-current="page"',
      );
    }
  }
});

test("Documents, Links, Analytics, and Settings name themselves without an Overview above them", async () => {
  const fixture = await createOrganizationFixture();

  for (const [path, label] of [
    ["/dashboard/documents", "Documents"],
    ["/dashboard/links", "Links"],
    ["/dashboard/analytics", "Analytics"],
    ["/dashboard/settings", "Settings"],
  ] as const) {
    const response = await fixture.member.http(new URL(path, process.env.BETTER_AUTH_URL), {
      redirect: "manual",
    });
    const trail = breadcrumbTrail(serverRenderedMarkupOf(await response.text()));

    expect(response.status, path).toBe(200);
    expect(trail, path).toContain(`>${label}</span>`);
    expect(trail, path).toContain('data-slot="breadcrumb-page"');
    expect(trail, path).not.toContain("Overview");
    expect(trail, path).not.toContain(`href="${path}"`);
  }
});

test("a missing Document, Vault, or Link cold load keeps Chrome around the content skeleton", async () => {
  const fixture = await createOrganizationFixture();
  const missingId = "01900000-0000-7000-8000-000000000001";

  for (const path of [
    `/dashboard/documents/${missingId}`,
    `/dashboard/documents/${missingId}/edit`,
    `/dashboard/vaults/${missingId}`,
    `/dashboard/links/${missingId}`,
    `/dashboard/analytics/${missingId}`,
  ]) {
    const response = await fixture.member.http(new URL(path, process.env.BETTER_AUTH_URL), {
      redirect: "manual",
    });
    const html = await response.text();
    const serverRenderedMarkup = serverRenderedMarkupOf(html);

    expect(response.status, path).toBe(200);
    expect(serverRenderedMarkup, path).toContain('data-slot="sidebar"');
    expect(serverRenderedMarkup, path).toContain('data-slot="sidebar-trigger"');
    expect(breadcrumbTrail(serverRenderedMarkup), path).toContain('aria-label="breadcrumb"');
    expect(serverRenderedMarkup, path).toContain(fixture.member.user.name);
    expect(serverRenderedMarkup, path).toContain(fixture.organization.name);
    expect(serverRenderedMarkup, path).toContain('data-slot="skeleton"');
    expect(serverRenderedMarkup, path).toContain('aria-label="Loading dashboard"');
    // Recovery copy belongs to the client-only pane after the collection lookup, not the cold load.
    expect(serverRenderedMarkup, path).not.toContain("This Document isn't here");
  }
});

test("a Document, Vault, or Link from another Organization is not-found without leaking that it exists", async () => {
  const [viewer, owner] = await Promise.all([
    createOrganizationFixture(),
    createOrganizationFixture(),
  ]);
  const foreignDocument = await createFixtureDocument({
    organizationId: owner.organization.id,
    createdBy: owner.member.user.id,
    title: "Secret notes from another Organization",
  });
  const foreignVault = await createFixtureVault({
    organizationId: owner.organization.id,
    name: "Secret Vault from another Organization",
  });
  const foreignLink = await createFixtureLink({
    organizationId: owner.organization.id,
    createdBy: owner.member.user.id,
    documentId: foreignDocument.id,
    slug: "secretxorg1",
  });

  for (const [path, leaked] of [
    [`/dashboard/documents/${foreignDocument.id}`, foreignDocument.title],
    [`/dashboard/vaults/${foreignVault.id}`, foreignVault.name],
    [`/dashboard/links/${foreignLink.id}`, foreignLink.slug],
    [`/dashboard/analytics/${foreignLink.id}`, foreignLink.slug],
  ] as const) {
    const response = await viewer.member.http(new URL(path, process.env.BETTER_AUTH_URL), {
      redirect: "manual",
    });
    const html = await response.text();
    const serverRenderedMarkup = serverRenderedMarkupOf(html);

    expect(response.status, path).toBe(200);
    expect(serverRenderedMarkup, path).toContain('data-slot="sidebar"');
    expect(serverRenderedMarkup, path).toContain('aria-label="Loading dashboard"');
    expect(html, path).not.toContain(leaked);
  }
});

test("an analytics Link breadcrumb hangs the Link under a navigable Analytics", async () => {
  const fixture = await createOrganizationFixture();
  const fixtureDocument = await createFixtureDocument({
    organizationId: fixture.organization.id,
    createdBy: fixture.member.user.id,
  });
  const fixtureLink = await createFixtureLink({
    organizationId: fixture.organization.id,
    createdBy: fixture.member.user.id,
    documentId: fixtureDocument.id,
  });

  const response = await fixture.member.http(
    new URL(`/dashboard/analytics/${fixtureLink.id}`, process.env.BETTER_AUTH_URL),
    { redirect: "manual" },
  );
  const trail = breadcrumbTrail(serverRenderedMarkupOf(await response.text()));

  expect(response.status).toBe(200);
  expect(trail).toContain('href="/dashboard/analytics"');
  expect(trail).toContain(">Link</span>");
  expect(trail).not.toContain(fixtureLink.id);
});

test("a Link detail breadcrumb hangs the Link under a navigable Links", async () => {
  const fixture = await createOrganizationFixture();
  const fixtureDocument = await createFixtureDocument({
    organizationId: fixture.organization.id,
    createdBy: fixture.member.user.id,
  });
  const fixtureLink = await createFixtureLink({
    organizationId: fixture.organization.id,
    createdBy: fixture.member.user.id,
    documentId: fixtureDocument.id,
  });

  const response = await fixture.member.http(
    new URL(`/dashboard/links/${fixtureLink.id}`, process.env.BETTER_AUTH_URL),
    { redirect: "manual" },
  );
  const trail = breadcrumbTrail(serverRenderedMarkupOf(await response.text()));

  expect(response.status).toBe(200);
  expect(trail).toContain('href="/dashboard/links"');
  expect(trail).toContain(">Link</span>");
  expect(trail).not.toContain(fixtureLink.id);
});

test("an owner opening a PDF Preview appends no visit_event of any type", async () => {
  const fixture = await createOrganizationFixture();
  const uploaded = await createFixtureUploadedDocument({
    organizationId: fixture.organization.id,
    createdBy: fixture.member.user.id,
    contentType: "application/pdf",
    fileName: "term-sheet.pdf",
    bytes: readUploadSample("two-page.pdf"),
  });

  // The Preview is the detail route plus the bytes its island fetches. An owner checking their own
  // Document is not a Visitor, so neither request may leave anything in the analytics stream.
  const page = await fixture.member.http(
    new URL(`/dashboard/documents/${uploaded.id}`, process.env.BETTER_AUTH_URL),
    { redirect: "manual" },
  );
  const bytes = await fixture.member.http(
    new URL(`/api/documents/${uploaded.id}/bytes`, process.env.BETTER_AUTH_URL),
    { redirect: "manual" },
  );

  expect(page.status).toBe(200);
  expect(bytes.status).toBe(200);
  expect(await database.select({ id: visitEvent.id }).from(visitEvent)).toEqual([]);
  expect(await database.select({ id: visit.id }).from(visit)).toEqual([]);
});
