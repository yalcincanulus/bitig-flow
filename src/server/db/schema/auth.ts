import { sql } from "drizzle-orm";
import { boolean, index, snakeCase, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

const timestampWithTimezone = () => timestamp({ withTimezone: true, mode: "date" });

const primaryKey = () =>
  uuid()
    .primaryKey()
    .default(sql`uuidv7()`);

export const user = snakeCase.table("user", {
  id: primaryKey(),
  name: text().notNull(),
  email: text().notNull().unique(),
  emailVerified: boolean().default(false).notNull(),
  image: text(),
  createdAt: timestampWithTimezone().defaultNow().notNull(),
  updatedAt: timestampWithTimezone()
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

export const session = snakeCase.table(
  "session",
  {
    id: primaryKey(),
    expiresAt: timestampWithTimezone().notNull(),
    token: text().notNull().unique(),
    createdAt: timestampWithTimezone().defaultNow().notNull(),
    updatedAt: timestampWithTimezone()
      .$onUpdate(() => new Date())
      .notNull(),
    ipAddress: text(),
    userAgent: text(),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    activeOrganizationId: uuid(),
  },
  (table) => [index("session_user_id_idx").on(table.userId)],
);

export const account = snakeCase.table(
  "account",
  {
    id: primaryKey(),
    accountId: text().notNull(),
    providerId: text().notNull(),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text(),
    refreshToken: text(),
    idToken: text(),
    accessTokenExpiresAt: timestampWithTimezone(),
    refreshTokenExpiresAt: timestampWithTimezone(),
    scope: text(),
    password: text(),
    createdAt: timestampWithTimezone().defaultNow().notNull(),
    updatedAt: timestampWithTimezone()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("account_user_id_idx").on(table.userId)],
);

export const verification = snakeCase.table(
  "verification",
  {
    id: primaryKey(),
    identifier: text().notNull(),
    value: text().notNull(),
    expiresAt: timestampWithTimezone().notNull(),
    createdAt: timestampWithTimezone().defaultNow().notNull(),
    updatedAt: timestampWithTimezone()
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);

export const organization = snakeCase.table(
  "organization",
  {
    id: primaryKey(),
    name: text().notNull(),
    slug: text().notNull().unique(),
    logo: text(),
    createdAt: timestampWithTimezone().notNull(),
    metadata: text(),
  },
  (table) => [uniqueIndex("organization_slug_uidx").on(table.slug)],
);

export const member = snakeCase.table(
  "member",
  {
    id: primaryKey(),
    organizationId: uuid()
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text().default("member").notNull(),
    createdAt: timestampWithTimezone().notNull(),
  },
  (table) => [
    index("member_organization_id_idx").on(table.organizationId),
    index("member_user_id_idx").on(table.userId),
    // ADR-0013: every authenticated request looks up this user's current role.
    index("member_user_id_organization_id_idx").on(table.userId, table.organizationId),
  ],
);

export const invitation = snakeCase.table(
  "invitation",
  {
    id: primaryKey(),
    organizationId: uuid()
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    email: text().notNull(),
    role: text(),
    status: text().default("pending").notNull(),
    expiresAt: timestampWithTimezone().notNull(),
    createdAt: timestampWithTimezone().defaultNow().notNull(),
    inviterId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [
    index("invitation_organization_id_idx").on(table.organizationId),
    index("invitation_email_idx").on(table.email),
  ],
);
