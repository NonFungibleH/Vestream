import {
  pgTable,
  uuid,
  text,
  boolean,
  integer,
  bigint,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
  numeric,
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
  // Free-tier push credits (lifetime, 3 total). Incremented when a push
  // alert is actually delivered to a free user; Pro/Fund are unmetered.
  pushAlertsSent:        integer("push_alerts_sent").default(0).notNull(),
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
    // BIGINT (not INTEGER). Signed 32-bit INTEGER overflows at 2147483647 ≈
    // year 2038, and real vesting contracts in the wild carry end-times well
    // past that (DAO treasury unlocks scheduled decades out, contracts with
    // sentinel "practically-never" values, etc.). Supabase threw
    // `value "9822026400" is out of range for type integer` on a seed run —
    // that was year 2281, but anything after 2038-01-19 breaks.
    // JS Number is safe up to 2^53 ≈ year 285 million, so `mode: "number"`
    // is fine for unix seconds.
    endTime:         bigint("end_time", { mode: "number" }),
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

// ── Protocol TVL snapshots ────────────────────────────────────────────────────
// One row per (protocol, chainId). Upserted daily by the TVL snapshot cron —
// see src/app/api/cron/tvl-snapshot/route.ts.
//
// Source of truth for /protocols page TVL + all cross-protocol TVL widgets.
// Replaces the previous "compute live on every request" approach which was
// (a) slow and (b) mixed DefiLlama's total-protocol figures in as if they
// were vesting-specific.
//
// Two sources supplied per row, distinguished by the `methodology` column:
//   - "defillama-vesting"  — pulled from api.llama.fi /protocols, chainTvls.vesting
//                            Only used for Sablier, Hedgey, Streamflow — the
//                            three protocols where DefiLlama exposes a genuine
//                            vesting-specific breakdown.
//   - "subgraph-walk-v1"   — exhaustive subgraph pagination, priced via our
//                            own DexScreener+CoinGecko pipeline (same confidence
//                            bands as existing tvl.ts). Used for UNCX, Unvest,
//                            Team Finance, Superfluid.
//   - "contract-reads-v1"  — EVM contract-read sweep (PinkSale PinkLock V2).
//   - "program-scan-v1"    — Solana getProgramAccounts sweep (Jupiter Lock).
//
// We store per (protocol, chainId) rather than aggregating because the
// confidence-band breakdown is chain-specific and the /protocols page can
// SUM across rows cheaply.
export const protocolTvlSnapshots = pgTable(
  "protocol_tvl_snapshots",
  {
    id:           uuid("id").primaryKey().defaultRandom(),
    // Composite natural key — one row per (protocol, chainId). Upsert target.
    protocol:     text("protocol").notNull(),      // matches ProtocolMeta.slug
    chainId:      integer("chain_id").notNull(),   // matches SupportedChainId
    // ── USD figures (numeric for precision; stored as decimal strings) ────────
    tvlUsd:       numeric("tvl_usd",    { precision: 24, scale: 2 }).notNull(),
    tvlHigh:      numeric("tvl_high",   { precision: 24, scale: 2 }).notNull().default("0"),
    tvlMedium:    numeric("tvl_medium", { precision: 24, scale: 2 }).notNull().default("0"),
    tvlLow:       numeric("tvl_low",    { precision: 24, scale: 2 }).notNull().default("0"),
    // ── coverage / quality ────────────────────────────────────────────────────
    streamCount:  integer("stream_count").notNull().default(0),  // distinct streams enumerated
    tokensPriced: integer("tokens_priced").notNull().default(0), // tokens we got a USD price for
    tokensTotal:  integer("tokens_total").notNull().default(0),  // distinct tokens seen in locked amounts
    // ── provenance ────────────────────────────────────────────────────────────
    methodology:  text("methodology").notNull(),    // see header comment for valid values
    // Optional: top N token contributions for UI tooltips + audit trail.
    // Shape: Array<{ tokenSymbol, tokenAddress, usd, confidence }>
    topContributors: jsonb("top_contributors").$type<Array<{
                       tokenSymbol?:  string;
                       tokenAddress:  string;
                       /** Post-cap (credited) USD — matches what fed the headline. */
                       usd:           number;
                       /** Pre-cap raw USD — kept for forensic audit when the
                        *  per-token liquidity-multiplier cap binds. Optional
                        *  because DefiLlama-passthrough rows skip capping. */
                       usdRaw?:       number;
                       confidence:    "high" | "medium" | "low";
                       source:        "dexscreener" | "coingecko" | "defillama";
                     }>>().default([]).notNull(),
    // ── bookkeeping ───────────────────────────────────────────────────────────
    computedAt:   timestamp("computed_at").defaultNow().notNull(),
    // Free-text audit trail — which cron ran this, how long it took, any
    // subgraph errors encountered. Never shown in UI; internal only.
    notes:        text("notes"),
  },
  (t) => [
    // Upsert target — one row per protocol × chain.
    uniqueIndex("ptvs_protocol_chain_idx").on(t.protocol, t.chainId),
    // Hot path: "give me all rows for this protocol, sum tvlUsd" on /protocols.
    index("ptvs_protocol_idx").on(t.protocol),
    // History-style lookups (once we stop overwriting).
    index("ptvs_protocol_computed_idx").on(t.protocol, t.computedAt),
  ]
);

// ── Demo web-push subscriptions ───────────────────────────────────────────────
// Anonymous push subscriptions for the 15-minute vesting demo on /demo.
// One row per (sessionId, endpoint) pair — when a visitor subscribes we mirror
// the minimal demo session state here so the `/api/cron/demo-push` job can fire
// milestone notifications without needing the visitor's cookie.
//
// Rows are ephemeral: the cron cleans up anything older than 30 minutes.
export const demoPushSubscriptions = pgTable(
  "demo_push_subscriptions",
  {
    id:              uuid("id").primaryKey().defaultRandom(),
    sessionId:       text("session_id").notNull(),          // UUID from demo iron-session
    endpoint:        text("endpoint").notNull(),            // PushSubscription.endpoint — used as natural dedupe key
    subscription:    jsonb("subscription").$type<{
                       endpoint: string;
                       keys: { p256dh: string; auth: string };
                     }>().notNull(),
    // Mirrored demo-session snapshot at subscribe-time
    startMs:         text("start_ms").notNull(),            // stringified unix ms (Postgres bigint avoidance)
    durationSec:     integer("duration_sec").notNull(),     // 15 * 60 = 900
    total:           text("total").notNull(),               // stringified bigint, 18 decimals
    tokenSymbol:     text("token_symbol").notNull(),        // "DEMO"
    // Which milestone percentages have already been pushed. Starts as [].
    milestonesFired: jsonb("milestones_fired").$type<number[]>().default([]).notNull(),
    createdAt:       timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("demo_push_session_idx").on(t.sessionId),
    index("demo_push_endpoint_idx").on(t.endpoint),
  ]
);
