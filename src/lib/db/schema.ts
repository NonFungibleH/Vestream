import {
  pgTable,
  uuid,
  text,
  boolean,
  integer,
  timestamp,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  address: text("address").notNull().unique(),
  tier: text("tier").default("free").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const wallets = pgTable("wallets", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  address: text("address").notNull(),
  label: text("label"),
  // null = scan all chains/protocols; non-null = restrict to listed IDs
  chains:    text("chains").array(),
  protocols: text("protocols").array(),
  addedAt: timestamp("added_at").defaultNow().notNull(),
});

export const notificationPreferences = pgTable("notification_preferences", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" })
    .unique(),
  emailEnabled: boolean("email_enabled").default(false).notNull(),
  email: text("email"),
  hoursBeforeUnlock: integer("hours_before_unlock").default(24).notNull(),
  notifyCliff: boolean("notify_cliff").default(true).notNull(),
  notifyStreamEnd: boolean("notify_stream_end").default(true).notNull(),
  notifyMonthly: boolean("notify_monthly").default(false).notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const notificationsSent = pgTable("notifications_sent", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  streamId: text("stream_id").notNull(),
  unlockTimestamp: timestamp("unlock_timestamp").notNull(),
  sentAt: timestamp("sent_at").defaultNow().notNull(),
});
