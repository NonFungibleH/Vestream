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
  primaryKey,
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
  // Worker-pivot field: which side of the product this user identifies with.
  // Drives dashboard hero copy, default tax export type, and which
  // protocols get recommended. Nullable for back-compat — existing users
  // read as "unknown" and get the legacy investor-flavoured UI until they
  // self-identify (next onboarding visit or via settings).
  //   "investor" | "worker" | "both"
  audienceCategory:      text("audience_category"),
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

// ── Claim events ────────────────────────────────────────────────────────────
// Every withdrawal/claim event we've observed for any tracked stream.
// Foundation for the Tax-ready claim history feature: tax exports
// (Koinly / CoinTracker / TurboTax / IRS 8949 / HMRC SA108) all need a
// per-claim row with timestamp, token, amount, USD value at claim time,
// gas paid, and a link back to the source stream.
//
// Data source per protocol:
//   - Sablier:      Withdrawal events from the Sablier Lockup subgraph
//   - Hedgey:       PlanRedeemed events from the Hedgey subgraph
//   - UNCX:         Withdrawn events from the UNCX subgraph
//   - Team Finance: Released events from the team-finance subgraph
//   - Superfluid:   ClaimedTotalAmount events
//   - PinkSale:     LockUnlocked events (contract reads, no subgraph)
//   - Streamflow:   Solana program-account snapshot diffs
//   - Jupiter Lock: Solana program-account snapshot diffs
//
// USD value at claim is computed at ingestion time using historical prices
// from CoinGecko (/coins/{id}/history endpoint cached in Upstash). Streams
// without a CoinGecko id fall back to nearest-available price ±24h, or
// null + a `priceConfidence` of "missing" so the UI can prompt the user
// for a manual cost basis.
//
// Indexes:
//   - (userId, claimedAt) — user's chronological claim feed
//   - (streamId)          — per-stream history view
//   - (chainId, txHash)   — dedup on backfill (each tx delivers one event)
export const claimEvents = pgTable("claim_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  /** Composite stream id matching vestingStreamsCache.streamId */
  streamId: text("stream_id").notNull(),
  protocol: text("protocol").notNull(),
  chainId:  integer("chain_id").notNull(),
  /** Recipient wallet that received the tokens (canonical lowercase). */
  recipient: text("recipient").notNull(),
  /** Token contract (canonical lowercase). */
  tokenAddress: text("token_address").notNull(),
  tokenSymbol:  text("token_symbol"),
  tokenDecimals: integer("token_decimals").notNull(),
  /** Amount claimed in token base units (stringified bigint — Postgres
   *  numeric would lose precision on >2^53). */
  amount: text("amount").notNull(),
  /** Wall-clock time of the claim (block timestamp on EVM, slot time
   *  derived for SVM). Stored as a timestamp for easy SQL date-range
   *  queries. */
  claimedAt: timestamp("claimed_at").notNull(),
  /** Source transaction. txHash unique-per-chain serves as the natural
   *  dedup key on backfill (each tx delivers one observable event). */
  txHash: text("tx_hash").notNull(),
  /** Gas paid in native chain token (wei for EVM, lamports for SVM)
   *  as stringified bigint. Null if we couldn't fetch the receipt. */
  gasNative: text("gas_native"),
  /** USD value at claim time. Null when we couldn't price the token at
   *  the claim block — UI prompts for manual cost basis in that case. */
  usdValueAtClaim: numeric("usd_value_at_claim"),
  /** Pricing confidence:
   *    "exact"     — CoinGecko historical at the exact day
   *    "nearest"   — fell back to the nearest available price within ±24h
   *    "missing"   — no historical price available; usdValueAtClaim is null
   */
  priceConfidence: text("price_confidence").notNull().default("missing"),
  /** Gas value in USD at the time of the claim (separate from token USD
   *  so we don't double-count the wei→USD conversion). */
  gasUsdValueAtClaim: numeric("gas_usd_value_at_claim"),
  /** When this row was inserted into our index. Distinct from claimedAt:
   *  a tx that happened years ago gets backfilled with the original
   *  claimedAt but the indexedAt is now. */
  indexedAt: timestamp("indexed_at").defaultNow().notNull(),
}, (t) => [
  index("claim_events_user_claimed_idx").on(t.userId, t.claimedAt),
  index("claim_events_stream_idx").on(t.streamId),
  uniqueIndex("claim_events_chain_tx_uq").on(t.chainId, t.txHash, t.recipient, t.tokenAddress),
]);

// ── Token watchlist ─────────────────────────────────────────────────────────
// Tokens the user wants to track WITHOUT receiving them — typically a token
// they're considering buying, or watching for unlock pressure that might
// affect their existing positions. Different from `wallets`: those are
// addresses the user owns and we scan for vests; watchlist entries are
// tokens whose unlock calendar the user wants alerts on, regardless of
// whether they hold them.
//
// Free tier: 5 entries. Pro: unlimited.
export const watchlist = pgTable("watchlist", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  chainId: integer("chain_id").notNull(),
  // Lowercase canonical — same convention as wallets.address
  tokenAddress: text("token_address").notNull(),
  // User-visible label override; falls back to on-chain symbol if null.
  label: text("label"),
  // Per-entry alert toggle. Default: opt-in to weekly digest, opt-out of
  // per-event push (per-event is noisy when watchlist grows).
  weeklyDigest: boolean("weekly_digest").default(true).notNull(),
  perEventPush: boolean("per_event_push").default(false).notNull(),
  addedAt: timestamp("added_at").defaultNow().notNull(),
}, (t) => [
  index("watchlist_user_idx").on(t.userId),
  uniqueIndex("watchlist_user_chain_token_uq").on(t.userId, t.chainId, t.tokenAddress),
]);

/**
 * Per-user, per-stream annotations — custom name + freeform notes.
 *
 * Stickiness feature shipped May 2026. Lets users rename streams away
 * from auto-generated labels ("Sablier stream #12345" → "Series A —
 * Acme Capital") and attach short context notes (200 chars max).
 *
 * Design notes:
 *  - Per-user — annotations are personal context. User A's note on a
 *    stream user B also tracks is invisible to B.
 *  - stream_id matches the canonical VestingStream.id format
 *    (`{protocol}-{chainId}-{nativeId}`) — stable across cache rebuilds.
 *  - Sparse — only streams that have been annotated get a row.
 *  - Cascade-delete with the user. If we ever add wallet-level
 *    cascade we can also delete by stream_id prefix.
 *  - notes is capped at 200 chars at the API layer (see PUT route).
 *    Schema permits longer to allow future relaxation without a
 *    migration.
 */
export const streamAnnotations = pgTable("stream_annotations", {
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  /** Composite stream id matching VestingStream.id — `{protocol}-{chainId}-{nativeId}`. */
  streamId:    text("stream_id").notNull(),
  /** User-chosen display name. Null = use protocol-derived auto-name. */
  customName:  text("custom_name"),
  /** Freeform plain-text note. 200-char cap enforced at API layer. */
  notes:       text("notes"),
  createdAt:   timestamp("created_at").defaultNow().notNull(),
  updatedAt:   timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  primaryKey({ columns: [t.userId, t.streamId] }),
  // Read pattern: "all annotations for this user across all their streams" —
  // used to bulk-attach annotations to the dashboard's stream list in one
  // query rather than one-per-stream.
  index("stream_annotations_user_idx").on(t.userId),
]);

/**
 * Per-user, per-stream tags — free-form labels with optional colour.
 *
 * Sister feature to stream_annotations (notes + custom names). Tags let
 * users build a personal taxonomy: "Investor", "Salary", "Advisor",
 * "Side-project", etc. Filterable on the dashboard, exported in CSV.
 *
 * Design notes:
 *  - Per-user — each user's tag set is private. User A's "Salary" tag
 *    on a stream user B also tracks is invisible to B.
 *  - Multiple tags per stream allowed (composite PK includes `tag`).
 *  - Tag value stored as text (max 30 chars enforced at API layer).
 *    Lowercase normalisation also at API layer so "Salary"/"salary"/
 *    "SALARY" don't proliferate.
 *  - `color` is a hex string ("#RRGGBB") — nullable; UI defaults from a
 *    palette when null.
 *  - Index on user_id supports the "all tags for this user" bulk read
 *    used by the dashboard to populate filter chips and per-row pills.
 *  - Cascade-deletes with the user. We don't cascade off
 *    vesting_streams_cache because tags should survive seeder rebuilds.
 */
export const streamTags = pgTable("stream_tags", {
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  /** Composite stream id matching VestingStream.id — `{protocol}-{chainId}-{nativeId}`. */
  streamId:  text("stream_id").notNull(),
  /** Tag value, lowercase-normalised at API layer. Cap 30 chars (API). */
  tag:       text("tag").notNull(),
  /** Optional hex colour ("#RRGGBB"). Renderer falls back to a default
   *  palette when null so users get colour without having to pick. */
  color:     text("color"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  primaryKey({ columns: [t.userId, t.streamId, t.tag] }),
  index("stream_tags_user_idx").on(t.userId),
  // Used when filtering "show all my streams tagged X"
  index("stream_tags_user_tag_idx").on(t.userId, t.tag),
]);

/**
 * Per-user opaque tokens for the public iCal calendar feed.
 *
 * Generated once on demand; stable across sessions; revocable by the user.
 * The token in the URL acts as the auth — `/api/calendar/{token}.ics` is
 * deliberately public-readable (so calendar apps can poll without
 * negotiating cookies/bearer tokens) but the token is opaque enough that
 * guessing it is infeasible.
 *
 * Token format: `vstr_cal_{32 bytes hex}` — same shape as the API key
 * format we use elsewhere. Stored as the literal token (no hash) because
 * we need to look it up by URL parameter; tokens are URL-safe and meant
 * to be shared in calendar-subscription URLs anyway.
 *
 * One token per user. Re-generation rotates it (old token invalidated).
 */
export const calendarTokens = pgTable("calendar_tokens", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  token:        text("token").notNull().unique(),
  createdAt:    timestamp("created_at").defaultNow().notNull(),
  /** Updated each time a calendar app fetches the .ics — useful diagnostic
   *  for "is the user actually subscribed?" without a separate analytics
   *  table. Nullable because never-fetched tokens shouldn't lie. */
  lastFetchedAt: timestamp("last_fetched_at"),
}, (t) => [
  // Lookup is by token (in URL path), not user_id. Index accordingly.
  index("calendar_tokens_token_idx").on(t.token),
]);

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
  // ── Added May 2026 (mobile UX Batch E) ────────────────────────────
  // Per-token alert overrides ({ streamId: { enabled, alert1Enabled,
  // hoursBeforeUnlock, pushTiming2, ... } }). Mobile app sent these
  // in the prefs payload but the server was silently dropping them,
  // so the per-token Switch toggles appeared to "not work" — they
  // saved, but the next refetch returned the stripped-server-state
  // and the toggle reverted. jsonb so adding new per-token fields
  // doesn't require schema migrations.
  streamPrefs:     jsonb("stream_prefs").default({}).notNull(),
  // "Next available claim" alert — fires when tokens become claimable.
  // Was in the mobile UI before but not in the server schema.
  notifyNextClaim: boolean("notify_next_claim").default(true).notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

/**
 * Saved searches from the dashboard explorer. Pro / Fund only.
 *
 * Each row stores the URL params of an explorer query the user wants
 * to keep watching. A daily cron re-runs each saved search; if new
 * matching unlock events have appeared since `lastNotifiedAt`, a
 * notification fires (email + push) and the timestamp updates.
 *
 * `paramsJson` is the raw `?q=...&mode=...&chain=...` payload — kept
 * as JSON instead of split columns so adding new filter dimensions
 * later doesn't require a migration. Read by buildExplorerUrl() to
 * regenerate the canonical URL when rendering the saved-search row.
 */
export const savedSearches = pgTable("saved_searches", {
  id:             uuid("id").primaryKey().defaultRandom(),
  userId:         uuid("user_id")
                    .notNull()
                    .references(() => users.id, { onDelete: "cascade" }),
  /** User-set name. Required — defaults to a generated description on create. */
  name:           text("name").notNull(),
  /** JSON object of explorer URL params (mode, q, chain, protocol, …). */
  paramsJson:     text("params_json").notNull(),
  /** When alerts on this search are enabled. Off by default. */
  alertsEnabled:  boolean("alerts_enabled").default(false).notNull(),
  /** Last time the cron ran this search and notified. Drives dedup. */
  lastNotifiedAt: timestamp("last_notified_at"),
  /** Last time the user manually opened this search (for sort order). */
  lastViewedAt:   timestamp("last_viewed_at"),
  createdAt:      timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("saved_searches_user_idx").on(t.userId),
]);

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
  tier:             text("tier").default("free").notNull(), // "free" | "mobile" | "pro"
  monthlyLimit:     integer("monthly_limit").default(1000).notNull(),
  usageThisMonth:   integer("usage_this_month").default(0).notNull(),
  usageMonthStart:  timestamp("usage_month_start").defaultNow().notNull(),
  lastUsedAt:       timestamp("last_used_at"),
  revokedAt:        timestamp("revoked_at"),
  notes:            text("notes"),
  /** Stripe Customer ID — set on first Pro upgrade. Survives subscription
   *  cancellations so a returning user pays into the same customer record. */
  stripeCustomerId:     text("stripe_customer_id"),
  /** Currently active Stripe Subscription ID. NULL = no active subscription
   *  (free tier). When a subscription is cancelled this gets cleared so a
   *  later upgrade creates a fresh subscription rather than reactivating
   *  a stale one. */
  stripeSubscriptionId: text("stripe_subscription_id"),
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

// ── Webhook subscriptions (Pro tier) ──────────────────────────────────────
// One row per "tell me when this wallet has a new unlock matching X" rule.
// Owned by an apiKey (not a user) so server-to-server integrations can
// manage their own subscriptions without involving a human session.
//
// Delivery: the existing notify cron (`/api/cron/notify`) iterates every
// active subscription, finds matching upcoming unlocks since
// `lastFiredAt`, and POSTs to the URL with an HMAC signature derived
// from `secret`. On failure we increment `failureCount`; after 10
// consecutive failures we set `disabledAt` so we stop pinging dead URLs.
export const webhookSubscriptions = pgTable("webhook_subscriptions", {
  id:            uuid("id").primaryKey().defaultRandom(),
  apiKeyId:      uuid("api_key_id")
                   .notNull()
                   .references(() => apiKeys.id, { onDelete: "cascade" }),
  /** Destination URL to POST events to. Must be https in production. */
  url:           text("url").notNull(),
  /** HMAC-SHA256 secret used to sign delivered payloads. Stored as
   *  plaintext (must be — HMAC needs the same key on both sides). The
   *  secret is shown once on creation and we identify it in dashboards
   *  by its first 8 chars only. Receiver verifies the
   *  X-TokenVest-Signature header by recomputing
   *  hmacSha256(secret, rawBody). */
  secret:        text("secret").notNull(),
  /** Optional filters — null = match everything for this key. */
  walletFilter:  text("wallet_filter").array(),    // lowercased addresses
  protocolFilter: text("protocol_filter").array(), // canonical slugs
  chainFilter:   integer("chain_filter").array(),
  /** `events` is a comma-separated allow-list. v1 supports
   *  "upcoming_unlock" only; future values: "stream_completed",
   *  "wallet_added_to_index", etc. */
  events:        text("events").array().default(["upcoming_unlock"]).notNull(),
  /** Hours before unlock to fire — same semantics as the email notify
   *  pipeline. Default 24, range 1–168 (7 days). */
  hoursBefore:   integer("hours_before").default(24).notNull(),
  lastFiredAt:   timestamp("last_fired_at"),
  failureCount:  integer("failure_count").default(0).notNull(),
  /** Set when we've given up on this URL — receiver must rotate the URL
   *  or recreate the subscription to re-enable. */
  disabledAt:    timestamp("disabled_at"),
  createdAt:     timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("webhook_subs_api_key_idx").on(t.apiKeyId),
]);

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
    // Single-column protocol filter — used by /protocols/[slug] page
    // (getProtocolStats, getLatestUnlock, etc). Without this, a query
    // filtering only by `protocol` does a Seq Scan over 130k+ rows
    // (5-6s) and the protocol detail page hits the Cloudflare 100s
    // ceiling. Added live to prod via CREATE INDEX CONCURRENTLY on
    // May 4 2026 after pages went unusable; recovered to <1.5s.
    index("vsc_protocol_idx").on(t.protocol),
    // Compound (protocol, end_time) for the "upcoming unlocks for
    // protocol X" queries. Range-scans the hot tail of upcoming
    // events without re-filtering 40k+ Sablier rows in memory.
    index("vsc_protocol_end_time_idx").on(t.protocol, t.endTime),
    // Single-column token_symbol — used by getTopSymbols() at build
    // time and on /tokens index. Without it the GROUP BY does a Seq
    // Scan over 130k+ rows (1.6s); with it the planner uses the index
    // for the grouping (160ms).
    index("vsc_token_symbol_idx").on(t.tokenSymbol),
    // Expression index on lower(token_symbol) — used by
    // getTokensBySymbol() and any case-insensitive symbol filter.
    // Without it: 290ms parallel Seq Scan. With: 3ms index lookup.
    // Drizzle doesn't natively model expression indexes; declared via
    // raw SQL in migration 0017 and mirrored here as a comment.
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

// ── Status summary materialised view ─────────────────────────────────────────
// Pre-aggregated rollup of vesting_streams_cache, written by the seeder cron
// after each successful run. Replaces the GROUP BY full-scan that used to
// power /status and /api/admin/cache-stats.
//
// Why a real table not a view: the GROUP BY is expensive on the live cache
// table (50-100k rows growing). A real table is sub-50ms to read, cheap to
// write (~60 rows total — one per protocol × chain), and lets us add a
// `computedAt` provenance timestamp the UI can surface ("Last computed: 5m
// ago") without an extra query.
//
// Update strategy: refreshStatusSummary() runs the same aggregation
// expression that getCacheStatsCells() used to compute on-the-fly, then
// upserts the entire result in one transaction. Called from the seed-cache
// cron at the END of each group's run (not after each individual job —
// that would be 30-50 redundant rewrites per cron). Idempotent.
//
// Columns mirror CacheStatsCell for one-line read-path migration.
export const statusSummary = pgTable(
  "status_summary",
  {
    protocol:        text("protocol").notNull(),
    chainId:         integer("chain_id").notNull(),
    streams:         integer("streams").notNull().default(0),
    active:          integer("active").notNull().default(0),
    withTokenSymbol: integer("with_token_symbol").notNull().default(0),
    distinctTokens:  integer("distinct_tokens").notNull().default(0),
    // Unix seconds, nullable — null means cell is empty.
    freshestSec:     integer("freshest_sec"),
    oldestSec:       integer("oldest_sec"),
    // When this rollup row was last computed by the cron — independent of
    // the freshness numbers above, which describe the underlying data.
    computedAt:      timestamp("computed_at").defaultNow().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.protocol, t.chainId] }),
  ],
);

// ── Protocol summaries materialised view ─────────────────────────────────────
//
// Pre-aggregated rollup of vesting_streams_cache, written by the seeder
// cron after each successful run. Replaces the four slow aggregation
// queries that /protocols/[slug] used to run on every cold render
// (getProtocolStats was the slowest — count(distinct ...) + array_agg
// over filtered cache rows = 5+ seconds for Sablier).
//
// Same pattern as status_summary (migration 0016): tiny fixed-size table,
// upserted by the seeder, read by request paths in O(rows) where rows is
// the number of adapter ids being queried (always 1-2). Sub-30ms reads
// regardless of how big vesting_streams_cache grows.
//
// Why a dedicated table per query family:
//   - status_summary covers the (protocol × chain) freshness matrix.
//   - protocol_summaries covers per-protocol aggregates used by
//     /protocols/[slug] AND the /protocols index page.
// Both stay tiny (≤60 rows) and serve different query shapes; combining
// them into a single view would require either GROUP BY at read time or
// duplicated columns. Keeping them separate is clearer.
//
// Active-stream semantics (the May 4 2026 LlamaPay-shows-0-active fix):
//   - For category="vesting" protocols: active = count where !is_fully_vested
//   - For category="stream"  protocols: active = total (every flowing
//     stream IS active — the per-stream isFullyVested=true convention
//     suppresses cliff-countdown UI but doesn't mean the stream stopped)
//
// The split happens in refreshProtocolSummaries(), keyed off the
// PROTOCOL_DEFAULT_CATEGORY map in @vestream/shared. Storing a single
// activeStreams column means the read path doesn't need to know about
// categories at all.
export const protocolSummaries = pgTable(
  "protocol_summaries",
  {
    protocol:        text("protocol").primaryKey(),
    totalStreams:    integer("total_streams").notNull().default(0),
    activeStreams:   integer("active_streams").notNull().default(0),
    tokensTracked:   integer("tokens_tracked").notNull().default(0),
    recipientCount:  integer("recipient_count").notNull().default(0),
    // jsonb so the int[] of chains is portable across drizzle-kit
    // introspection rounds (drizzle's native int[] handling is fragile).
    chainIds:        jsonb("chain_ids").$type<number[]>().notNull().default([]),
    lastIndexedAt:   timestamp("last_indexed_at"),
    computedAt:      timestamp("computed_at").defaultNow().notNull(),
  },
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

// ── Token prices cache (May 11 2026) ─────────────────────────────────────────
// Per-token last-known price + DEX liquidity, populated by both the daily TVL
// snapshot cron AND a separate hourly refresh cron. Read-through cache: the
// pricing pipeline checks here BEFORE calling DexScreener / CoinGecko, only
// fetching from external APIs on cache miss or stale entries.
//
// Why this exists: the daily snapshot cron used to fan out thousands of
// price lookups simultaneously, which 429-rate-limited both free pricing
// APIs. The headline TVL would degrade overnight whenever DexScreener had
// a bad day. With this cache, a bad pricing day means we serve yesterday's
// (still good) cached prices instead of zeros.
//
// TTL semantics: callers decide what's "fresh enough" — pass a maxAgeSec
// to readPriceCache(). The hourly refresh cron picks the stalest entries
// (~500 per run) and re-prices them, keeping the working set warm.
//
// Capacity: ~30k rows expected (PinkSale dominates with ~26k token addrs
// across 4 chains). At ~200 bytes per row that's ~6MB total — fits easily
// in any Postgres tier. Index is on (chain_id, token_address) primary key
// for point lookups + on fetched_at for staleness queries.
// ─────────────────────────────────────────────────────────────────────────────
// Pending wallet links — web→mobile handoff
// ─────────────────────────────────────────────────────────────────────────────
//
// When a user runs a /find-vestings scan on the web and submits their email
// to "continue in the app", we store the (email, wallet) pair here. When that
// user later signs into the mobile app with the same email via OTP, the
// verify-otp endpoint auto-claims every unclaimed pending row matching the
// email and inserts the wallets into the user's wallets table.
//
// No deferred-deep-link service required — the email is the attribution
// vector. Returning users get the same treatment (claim is idempotent).
//
// Rows live for 30 days (`expiresAt`) and are swept by a daily cleanup job.
export const pendingWalletLinks = pgTable(
  "pending_wallet_links",
  {
    id:            uuid("id").primaryKey().defaultRandom(),
    // Lowercased before insert so dedupe + claim stay case-insensitive.
    email:         text("email").notNull(),
    walletAddress: text("wallet_address").notNull(),
    // Optional user-supplied label captured at search time (e.g. "vesting wallet").
    label:         text("label"),
    // Optional chain narrowing — when present, the wallet is added with these
    // chains pre-selected. Null = scan all chains (matches the wallets table
    // semantics).
    chainIds:      jsonb("chain_ids").$type<number[] | null>(),
    createdAt:     timestamp("created_at").defaultNow().notNull(),
    // Set when the corresponding wallet has been added to a user's account
    // via OTP verify. Null = still pending. Keeping the row post-claim gives
    // us an audit trail for the analytics funnel (search → claim conversion).
    claimedAt:     timestamp("claimed_at"),
    // 30-day TTL. Daily cleanup cron deletes WHERE expires_at < NOW() AND
    // claimed_at IS NULL.
    expiresAt:     timestamp("expires_at").notNull(),
  },
  (t) => [
    // Hot path: "claim every unclaimed pending row for email X" on OTP verify.
    index("pending_wallet_links_email_idx").on(t.email),
    // Dedup: re-searching the same wallet from the same email just updates
    // expiresAt, doesn't pile up duplicates.
    uniqueIndex("pending_wallet_links_email_wallet_unique").on(t.email, t.walletAddress),
  ]
);

export const tokenPricesCache = pgTable(
  "token_prices_cache",
  {
    chainId:      integer("chain_id").notNull(),
    tokenAddress: text("token_address").notNull(),
    // USD price per whole token. NUMERIC(40,18) is wide enough for tiny
    // memecoin prices (10^-15) AND large stablecoin-ish tokens.
    priceUsd:     numeric("price_usd", { precision: 40, scale: 18 }).notNull(),
    // DEX-aggregated liquidity in USD. Drives the high/medium/low confidence
    // band assignment in tvl.ts. Null = unknown (e.g. CoinGecko-priced tokens).
    liquidityUsd: numeric("liquidity_usd", { precision: 40, scale: 2 }),
    // Which API the price came from. Drives confidence semantics downstream.
    source:       text("source").notNull(),  // "dexscreener" | "coingecko"
    // When this entry was written. The refresh cron picks the oldest first.
    fetchedAt:    timestamp("fetched_at").defaultNow().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.chainId, t.tokenAddress] }),
    // Hot path for the refresh cron: "give me the N stalest entries".
    index("token_prices_fetched_at_idx").on(t.fetchedAt),
  ]
);
