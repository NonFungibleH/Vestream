import {
  pgTable,
  uuid,
  text,
  boolean,
  integer,
  timestamp,
  jsonb,
  index,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  address: text("address").notNull().unique(), // unique() creates an index automatically
  tier: text("tier").default("free").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  // Discover scan rate limiting: 3 scans per 24-hour rolling window
  scanCount:       integer("scan_count").default(0).notNull(),
  scanWindowStart: timestamp("scan_window_start"),
  // Free-plan settings cooldown: track last wallet mutation to enforce 24h change limit
  settingsChangedAt: timestamp("settings_changed_at"),
  // Mobile app profiling columns
  userType:              text("user_type"),           // "team_member"|"investor"|"fund_manager"|"airdrop_recipient"
  vestingCount:          text("vesting_count"),        // "1-3"|"4-10"|"10+"|"unsure"
  currentTracking:       text("current_tracking"),     // "spreadsheet"|"protocol_websites"|"nothing"|"another_tool"
  onboardingCompletedAt: timestamp("onboarding_completed_at"),
  expoPushToken:         text("expo_push_token"),
  // Billing / trial columns (Task 17)
  trialEndsAt:           timestamp("trial_ends_at"),
  stripeCustomerId:      text("stripe_customer_id"),
  stripeSubscriptionId:  text("stripe_subscription_id"),
});

export const wallets = pgTable("wallets", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  address: text("address").notNull(),
  label: text("label"),
  // null = scan all chains/protocols; non-null = restrict to listed IDs
  chains:       text("chains").array(),
  protocols:    text("protocols").array(),
  // optional ERC-20 contract address — when set, only streams for this token are shown
  tokenAddress: text("token_address"),
  addedAt: timestamp("added_at").defaultNow().notNull(),
}, (t) => [
  index("wallets_user_idx").on(t.userId),
  index("wallets_user_address_idx").on(t.userId, t.address),
]);

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

// ── Public API keys ───────────────────────────────────────────────────────────
// Invite-only at launch. Keys are issued by admin endpoint.
// Plaintext key is NEVER stored — only SHA-256 hash.
// Key format: vstr_live_{32 random hex bytes}
export const apiKeys = pgTable("api_keys", {
  id:               uuid("id").primaryKey().defaultRandom(),
  keyHash:          text("key_hash").notNull().unique(),   // SHA-256(plaintext key) — unique() creates index
  keyPrefix:        text("key_prefix").notNull(),           // first 12 chars, for display
  ownerEmail:       text("owner_email").notNull(),
  ownerName:        text("owner_name"),
  tier:             text("tier").default("free").notNull(), // "free" | "pro"
  monthlyLimit:     integer("monthly_limit").default(1000).notNull(),
  usageThisMonth:   integer("usage_this_month").default(0).notNull(),
  usageMonthStart:  timestamp("usage_month_start").defaultNow().notNull(),
  lastUsedAt:       timestamp("last_used_at"),
  revokedAt:        timestamp("revoked_at"),
  notes:            text("notes"),
  createdAt:        timestamp("created_at").defaultNow().notNull(),
});

// ── API access requests ───────────────────────────────────────────────────────
// Submitted via /developer page. Reviewed manually before key issuance.
export const apiAccessRequests = pgTable("api_access_requests", {
  id:        uuid("id").primaryKey().defaultRandom(),
  name:      text("name").notNull(),
  email:     text("email").notNull(),
  company:   text("company"),
  useCase:   text("use_case").notNull(),
  protocols: text("protocols").array(),
  reviewed:  boolean("reviewed").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const waitlist = pgTable("waitlist", {
  id:        uuid("id").primaryKey().defaultRandom(),
  email:     text("email").notNull().unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ── Beta feedback ─────────────────────────────────────────────────────────────
export const betaFeedback = pgTable("beta_feedback", {
  id:          uuid("id").primaryKey().defaultRandom(),
  userAddress: text("user_address"),          // null = submitted before wallet connect
  rating:      integer("rating"),             // 1–5 star rating, optional
  message:     text("message").notNull(),
  page:        text("page"),                  // which page they were on when submitted
  createdAt:   timestamp("created_at").defaultNow().notNull(),
});

// ── Persistent vesting stream cache ───────────────────────────────────────────
// Stores normalised VestingStream objects fetched from subgraphs.
// Immutable fields (token, amounts, schedule) are kept indefinitely.
// Mutable fields (claimable, withdrawn, isFullyVested) are refreshed every 5 min.
// This table is the foundation of the external API / data layer.
export const vestingStreamsCache = pgTable(
  "vesting_streams_cache",
  {
    // Composite natural key e.g. "sablier-1-12345" — matches VestingStream.id
    streamId:        text("stream_id").primaryKey(),
    // ── lookup columns (indexed) ──────────────────────────────────────────────
    recipient:       text("recipient").notNull(),   // wallet address, lowercase
    chainId:         integer("chain_id").notNull(),
    protocol:        text("protocol").notNull(),
    tokenAddress:    text("token_address"),
    tokenSymbol:     text("token_symbol"),
    isFullyVested:   boolean("is_fully_vested").notNull().default(false),
    endTime:         integer("end_time"),            // unix seconds
    // ── full normalised stream data ───────────────────────────────────────────
    streamData:      jsonb("stream_data").$type<Record<string, unknown>>().notNull(),
    // ── cache bookkeeping ─────────────────────────────────────────────────────
    firstSeenAt:     timestamp("first_seen_at").defaultNow().notNull(),
    lastRefreshedAt: timestamp("last_refreshed_at").defaultNow().notNull(),
  },
  (t) => [
    index("vsc_recipient_idx").on(t.recipient),
    index("vsc_recipient_chain_idx").on(t.recipient, t.chainId),
    index("vsc_recipient_protocol_idx").on(t.recipient, t.protocol),
  ]
);

// ── Mobile bearer tokens ──────────────────────────────────────────────────────
// Long-lived tokens issued to the mobile app. SHA-256 hash stored — never plaintext.
// Token format: vstr_mob_{32 random hex bytes}
export const mobileTokens = pgTable("mobile_tokens", {
  id:          uuid("id").primaryKey().defaultRandom(),
  userId:      uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash:   text("token_hash").notNull().unique(),  // SHA-256 of bearer token
  tokenPrefix: text("token_prefix").notNull(),          // first 12 chars for logging
  expiresAt:   timestamp("expires_at").notNull(),
  createdAt:   timestamp("created_at").defaultNow().notNull(),
  lastUsedAt:  timestamp("last_used_at"),
}, (t) => [index("mobile_tokens_user_idx").on(t.userId)]);

// ── Mobile OTPs ───────────────────────────────────────────────────────────────
// Short-lived one-time passwords for email sign-in on mobile. OTP stored as SHA-256 hash.
export const mobileOtps = pgTable("mobile_otps", {
  id:        uuid("id").primaryKey().defaultRandom(),
  email:     text("email").notNull(),
  otpHash:   text("otp_hash").notNull(),    // SHA-256 of OTP — don't store plaintext
  expiresAt: timestamp("expires_at").notNull(),
  used:      boolean("used").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
