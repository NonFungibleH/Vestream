# Find-Vestings Conversion Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign post-scan results on `/find-vestings` so the web shows proof of vestings (protocol/chain/token symbol) but gates actual amounts behind an app install, making the App Store/Play Store download the single dominant conversion action.

**Architecture:** All changes live in `src/app/find-vestings/FindVestingsClient.tsx`. Four focused changes: (1) fix the broken `AppStoreBadge` link, (2) replace `GroupCard` with `TeaserCard` that blurs amounts behind a CTA overlay, (3) replace `ResultsActionStrip` with a new `DownloadGate` component bearing the real store badges and the notification mockup on all screen sizes, (4) reorder `ResultsBlock` so the gate appears above the cards, demote `SaveToAppCard` to below them, and remove the now-redundant `MobileAppCta`.

**Tech Stack:** Next.js 16, React, Tailwind CSS v4, inline styles. `TrackInAppCTA` (deep-link → App Store fallback) is kept for per-card claim actions and the sticky bar. New store-badge `<a>` tags in `DownloadGate` link directly to the stores (no deep-link delay — user hasn't installed yet).

---

## File Map

| File | Change |
|---|---|
| `src/app/find-vestings/FindVestingsClient.tsx` | All changes — broken down in tasks below |

No new files. No other files touched.

---

## Task 1 — Fix AppStoreBadge broken link

**Files:**
- Modify: `src/app/find-vestings/FindVestingsClient.tsx` — `AppStoreBadge` function (~line 1178)

The `AppStoreBadge` component inside `MobileAppCta` uses `<Link href="/early-access">` — it sends users to a waitlist page instead of the App Store. Fix it now as a standalone commit so it is live immediately regardless of the larger redesign.

- [ ] **Step 1: Read the current `AppStoreBadge` function**

  Confirm line numbers around:
  ```tsx
  function AppStoreBadge() {
    return (
      <Link
        href="/early-access"   // ← broken
  ```

- [ ] **Step 2: Replace the `<Link>` with a real `<a>` tag**

  Replace the entire `AppStoreBadge` function body with:

  ```tsx
  function AppStoreBadge() {
    return (
      <a
        href="https://apps.apple.com/us/app/vestream-token-unlocks/id6769799911"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-3 px-5 py-2.5 rounded-xl transition-all hover:opacity-85"
        style={{
          background: "black",
          color: "white",
          border: "1px solid rgba(255,255,255,0.2)",
          minWidth: 180,
        }}
        aria-label="Download on the App Store"
      >
        <svg width="26" height="26" viewBox="0 0 24 24" fill="white" aria-hidden="true">
          <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
        </svg>
        <div className="text-left leading-tight">
          <div className="text-[9px] uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.7)" }}>
            Download on the
          </div>
          <div className="text-base font-semibold">App Store</div>
        </div>
      </a>
    );
  }
  ```

  Also remove the `import Link from "next/link"` if it is no longer used elsewhere in the file. (Check — `Link` is also used in `AppStoreBadge` only. If that was the only usage, remove the import to avoid lint warning.)

  > **Note:** `next/link` vs `<a>`: Next.js `Link` is for internal client-side navigation. App Store is an external URL — a plain `<a target="_blank">` is correct here.

- [ ] **Step 3: Verify build passes**

  ```bash
  cd /Users/howardpearce/vestr && npm run build 2>&1 | tail -20
  ```

  Expected: no TypeScript errors, no unused import warnings.

- [ ] **Step 4: Commit**

  ```bash
  git add src/app/find-vestings/FindVestingsClient.tsx
  git commit -m "fix: AppStoreBadge now links to App Store instead of /early-access"
  ```

---

## Task 2 — Replace GroupCard with TeaserCard (blurred amounts)

**Files:**
- Modify: `src/app/find-vestings/FindVestingsClient.tsx` — replace `GroupCard` function, update its call site in `ResultsBlock`

The card shows the protocol header (name, chain, stream count) in full. The token amount rows are rendered normally but wrapped in a blurred layer; an absolutely-positioned overlay sits on top with a single CTA. Claimable-now tokens get a green "Claim in app →" button; others get a teal "See amounts →".

- [ ] **Step 1: Add `TeaserCard` function after the existing `GroupCard` function**

  ```tsx
  function TeaserCard({ group, walletAddress }: { group: Group; walletAddress: string }) {
    const colour = PROTOCOL_COLOURS[group.protocolId] ?? "#8B8E92";

    // Determine if any token in this group has a claimable balance.
    // Used to choose between "Claim in app →" and "See amounts →".
    const liveClaimableSymbol: string | null = (() => {
      for (const tok of group.tokens) {
        if (BigInt(tok.claimableNowRaw || "0") > 0n) return tok.symbol || null;
      }
      return null;
    })();

    return (
      <div
        className="rounded-2xl p-5 md:p-6"
        style={{ background: "white", border: "1px solid rgba(0,0,0,0.07)" }}
      >
        {/* ── Card header — always visible ─────────────────────────── */}
        <div className="flex items-center gap-3 mb-4">
          <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: colour }} />
          <div>
            <div className="text-base font-bold" style={{ color: "#1A1D20" }}>
              {group.protocolName}
            </div>
            <div className="text-xs" style={{ color: "#8B8E92" }}>
              {group.chainName} · {group.streamCount} stream{group.streamCount === 1 ? "" : "s"}
            </div>
          </div>
        </div>

        {/* ── Token rows — amounts blurred, CTA overlay ────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {group.tokens.slice(0, 4).map((tok) => {
            const tokClaimable = BigInt(tok.claimableNowRaw || "0") > 0n;
            return (
              <div
                key={tok.address || tok.symbol}
                className="rounded-xl overflow-hidden relative"
                style={{ background: "#f8fafc", border: "1px solid rgba(0,0,0,0.05)" }}
              >
                {/* Symbol row — always visible */}
                <div className="flex items-center justify-between px-3 pt-3 pb-1">
                  <span className="font-semibold text-sm" style={{ color: "#1A1D20" }}>
                    {tok.symbol || "—"}
                  </span>
                  <span className="text-[11px]" style={{ color: "#B8BABD" }}>
                    {tok.streamCount} stream{tok.streamCount === 1 ? "" : "s"}
                  </span>
                </div>

                {/* Amount block — blurred */}
                <div className="relative">
                  {/* Actual numbers, blurred so they are unreadable */}
                  <div
                    className="px-3 pb-3"
                    style={{
                      filter: "blur(5px)",
                      userSelect: "none",
                      pointerEvents: "none",
                    }}
                    aria-hidden="true"
                  >
                    <div className="text-[11px] uppercase tracking-wider font-semibold" style={{ color: "#B8BABD" }}>
                      Total
                    </div>
                    <div className="font-mono text-sm font-semibold" style={{ color: "#1A1D20" }}>
                      {fmtAmount(tok.totalAmountRaw, tok.decimals)}
                    </div>
                    {tokClaimable && (
                      <div className="text-[11px] font-mono mt-0.5" style={{ color: "#2DB36A" }}>
                        {fmtAmount(tok.claimableNowRaw, tok.decimals)} claimable
                      </div>
                    )}
                  </div>

                  {/* CTA overlay — sits above the blurred amounts */}
                  <div
                    className="absolute inset-0 flex items-center justify-center"
                    style={{ background: "rgba(248,250,252,0.55)" }}
                  >
                    <TrackInAppCTA
                      walletAddress={walletAddress}
                      tokenSymbol={tok.symbol}
                      surface={`find_vestings_teaser_${group.protocolId}`}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all hover:opacity-90 whitespace-nowrap"
                      style={
                        tokClaimable
                          ? { background: "#2DB36A", color: "white" }
                          : { background: "rgba(28,184,184,0.12)", color: "#1CB8B8", border: "1px solid rgba(28,184,184,0.25)" }
                      }
                    >
                      {tokClaimable ? "Claim in app →" : "See amounts →"}
                    </TrackInAppCTA>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {group.tokens.length > 4 && (
          <p className="text-xs mt-3" style={{ color: "#B8BABD" }}>
            + {group.tokens.length - 4} more token{group.tokens.length - 4 === 1 ? "" : "s"} in app
          </p>
        )}

        {/* ── Card footer ──────────────────────────────────────────── */}
        <div
          className="mt-4 pt-3 flex items-center justify-between gap-3"
          style={{ borderTop: "1px solid rgba(0,0,0,0.06)" }}
        >
          <div
            className="text-[11px] md:text-xs flex items-center gap-1.5 min-w-0"
            style={{ color: "#64748b" }}
          >
            <span
              className="w-1.5 h-1.5 rounded-full flex-shrink-0"
              style={{ background: liveClaimableSymbol ? "#2DB36A" : "#cbd5e1" }}
            />
            <span className="truncate">
              {liveClaimableSymbol ? (
                <><strong style={{ color: "#0f172a" }}>{liveClaimableSymbol}</strong> ready to claim — open in app</>
              ) : (
                <>Live progress &amp; alerts in app</>
              )}
            </span>
          </div>
          <TrackInAppCTA
            walletAddress={walletAddress}
            surface={`find_vestings_teaser_footer_${group.protocolId}`}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all hover:opacity-90 whitespace-nowrap flex-shrink-0"
            style={
              liveClaimableSymbol
                ? { background: "#2DB36A", color: "white" }
                : { background: "rgba(28,184,184,0.10)", color: "#1CB8B8", border: "1px solid rgba(28,184,184,0.25)" }
            }
          >
            {liveClaimableSymbol ? "Claim now →" : "Open app →"}
          </TrackInAppCTA>
        </div>
      </div>
    );
  }
  ```

- [ ] **Step 2: Delete the old `GroupCard` function**

  Remove the entire `GroupCard` function (it will be replaced by `TeaserCard`). It begins at the line:
  ```tsx
  function GroupCard({ group, walletAddress }: { group: Group; walletAddress: string }) {
  ```
  and ends with its closing `}`.

- [ ] **Step 3: Update the call site in `ResultsBlock`**

  In `ResultsBlock`, find:
  ```tsx
  <GroupCard
    key={`${g.protocolId}-${g.chainId}`}
    group={g}
    walletAddress={result.address}
  />
  ```
  Replace with:
  ```tsx
  <TeaserCard
    key={`${g.protocolId}-${g.chainId}`}
    group={g}
    walletAddress={result.address}
  />
  ```

- [ ] **Step 4: Verify build**

  ```bash
  cd /Users/howardpearce/vestr && npm run build 2>&1 | tail -20
  ```

  Expected: no errors, no unused variable warnings.

- [ ] **Step 5: Commit**

  ```bash
  git add src/app/find-vestings/FindVestingsClient.tsx
  git commit -m "feat: replace GroupCard with TeaserCard — blur amounts behind app CTA"
  ```

---

## Task 3 — Add DownloadGate, fix NotificationMockup, remove ResultsActionStrip

**Files:**
- Modify: `src/app/find-vestings/FindVestingsClient.tsx` — add `DownloadGate`, update `NotificationMockup`, delete `ResultsActionStrip`

`DownloadGate` is the new primary conversion component. It goes directly after `ResultsSummary`. It holds the headline, two store-badge `<a>` buttons (direct links, no deep-link delay), and the phone notification mockup. No social proof copy. The existing `NotificationMockup` is updated to remove `hidden md:flex` so it renders on all screen sizes.

- [ ] **Step 1: Update `NotificationMockup` to show on all screen sizes**

  Find the opening className in `NotificationMockup`:
  ```tsx
  className="hidden md:flex flex-col gap-2 w-[280px] flex-shrink-0"
  ```
  Replace with:
  ```tsx
  className="flex flex-col gap-2 w-full md:w-[240px] flex-shrink-0"
  ```

  This makes the mockup full-width on mobile (stacks below the copy in the single-column grid) and constrained on desktop (sits in the right column).

- [ ] **Step 2: Add `DownloadGate` function**

  Add the new function immediately before `ResultsActionStrip` (which will be deleted in the next step):

  ```tsx
  /**
   * Primary conversion gate shown immediately after ResultsSummary.
   * Goal: one dominant action — download the app to unlock amounts.
   * No social proof copy until we have real review data.
   */
  function DownloadGate({
    totalStreams,
    walletAddress,
    primarySymbol,
  }: {
    totalStreams: number;
    walletAddress: string;
    primarySymbol: string | null;
  }) {
    return (
      <div
        className="rounded-2xl p-5 md:p-7 relative overflow-hidden"
        style={{
          background: "linear-gradient(135deg, #1CB8B8 0%, #189D9D 100%)",
          boxShadow: "0 14px 38px rgba(28,184,184,0.32)",
        }}
      >
        {/* Subtle radial highlight */}
        <div
          className="absolute inset-0 pointer-events-none opacity-60"
          style={{
            backgroundImage:
              "radial-gradient(circle at 90% 10%, rgba(255,255,255,0.20), transparent 45%), radial-gradient(circle at 10% 110%, rgba(0,0,0,0.18), transparent 50%)",
          }}
        />

        <div className="relative grid grid-cols-1 md:grid-cols-[1fr,auto] gap-5 md:gap-10 items-center">
          {/* Left: headline + buttons */}
          <div className="min-w-0">
            <h3
              className="text-xl md:text-3xl font-bold leading-tight mb-2"
              style={{ color: "white", letterSpacing: "-0.02em" }}
            >
              {primarySymbol ? (
                <>
                  Don&rsquo;t miss your next{" "}
                  <span
                    style={{
                      background: "rgba(255,255,255,0.22)",
                      padding: "0 6px",
                      borderRadius: 6,
                    }}
                  >
                    {primarySymbol}
                  </span>{" "}
                  unlock
                </>
              ) : (
                <>
                  Your {totalStreams === 1 ? "vesting is" : `${totalStreams} vestings are`} ready
                </>
              )}
            </h3>
            <p
              className="text-sm mb-5"
              style={{ color: "rgba(255,255,255,0.82)", lineHeight: 1.55 }}
            >
              See live amounts, track progress, and claim — free on iOS and Android.
            </p>

            {/* Store badges — direct links, no deep-link delay */}
            <div className="flex flex-wrap gap-3">
              <a
                href="https://apps.apple.com/us/app/vestream-token-unlocks/id6769799911"
                target="_blank"
                rel="noopener noreferrer"
                onClick={() =>
                  track("cta_clicked", {
                    cta_id: "app_store_download",
                    surface: "find_vestings_gate",
                  })
                }
                className="inline-flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all hover:opacity-85"
                style={{
                  background: "black",
                  color: "white",
                  border: "1px solid rgba(255,255,255,0.2)",
                  minWidth: 155,
                }}
                aria-label="Download on the App Store"
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="white" aria-hidden="true">
                  <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
                </svg>
                <div className="text-left leading-tight">
                  <div
                    className="text-[9px] uppercase tracking-wider"
                    style={{ color: "rgba(255,255,255,0.7)" }}
                  >
                    Download on the
                  </div>
                  <div className="text-[15px] font-semibold">App Store</div>
                </div>
              </a>

              <a
                href="https://play.google.com/store/apps/details?id=io.vestream.app"
                target="_blank"
                rel="noopener noreferrer"
                onClick={() =>
                  track("cta_clicked", {
                    cta_id: "play_store_download",
                    surface: "find_vestings_gate",
                  })
                }
                className="inline-flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all hover:opacity-85"
                style={{
                  background: "black",
                  color: "white",
                  border: "1px solid rgba(255,255,255,0.2)",
                  minWidth: 155,
                }}
                aria-label="Get it on Google Play"
              >
                <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
                  <defs>
                    <linearGradient id="gp-blue"   x1="0%" y1="0%"   x2="100%" y2="100%"><stop offset="0%" stopColor="#00C3FF" /><stop offset="100%" stopColor="#1A73E8" /></linearGradient>
                    <linearGradient id="gp-green"  x1="0%" y1="0%"   x2="100%" y2="100%"><stop offset="0%" stopColor="#00F076" /><stop offset="100%" stopColor="#00D95F" /></linearGradient>
                    <linearGradient id="gp-red"    x1="0%" y1="0%"   x2="100%" y2="100%"><stop offset="0%" stopColor="#FF3A44" /><stop offset="100%" stopColor="#C31162" /></linearGradient>
                    <linearGradient id="gp-yellow" x1="0%" y1="0%"   x2="100%" y2="100%"><stop offset="0%" stopColor="#FFE000" /><stop offset="100%" stopColor="#FFBD00" /></linearGradient>
                  </defs>
                  <path fill="url(#gp-blue)"   d="M3.3 2.5c-.3.3-.5.8-.5 1.5v16c0 .7.2 1.2.5 1.5l9.4-9.5z" />
                  <path fill="url(#gp-green)"  d="M16.2 15 12.7 11.5 3.3 21a1.6 1.6 0 0 0 2 .1z" />
                  <path fill="url(#gp-yellow)" d="M20.8 11 16.2 8.4 12.3 12l3.9 3.9 4.6-2.6c1.4-.8 1.4-2.1 0-2.3z" />
                  <path fill="url(#gp-red)"    d="M5.3 2.4a1.6 1.6 0 0 0-2 .1l9.4 9.5L16.2 8.4z" />
                </svg>
                <div className="text-left leading-tight">
                  <div
                    className="text-[9px] uppercase tracking-wider"
                    style={{ color: "rgba(255,255,255,0.7)" }}
                  >
                    Get it on
                  </div>
                  <div className="text-[15px] font-semibold">Google Play</div>
                </div>
              </a>
            </div>

            <p className="text-xs mt-3" style={{ color: "rgba(255,255,255,0.65)" }}>
              Free · iOS &amp; Android
            </p>
          </div>

          {/* Right (or bottom on mobile): phone notification preview */}
          <NotificationMockup primarySymbol={primarySymbol} />
        </div>
      </div>
    );
  }
  ```

- [ ] **Step 3: Delete `ResultsActionStrip` function**

  Find and delete the entire `ResultsActionStrip` function. It begins:
  ```tsx
  function ResultsActionStrip({ totalStreams, walletAddress, primarySymbol }: ...
  ```
  and ends with its closing `}`.

- [ ] **Step 4: Verify build**

  ```bash
  cd /Users/howardpearce/vestr && npm run build 2>&1 | tail -20
  ```

  Expected: no errors. TypeScript will flag if `ResultsActionStrip` is still referenced somewhere — fix those references in the next task.

- [ ] **Step 5: Commit**

  ```bash
  git add src/app/find-vestings/FindVestingsClient.tsx
  git commit -m "feat: add DownloadGate with direct store links, notification mockup on all sizes"
  ```

---

## Task 4 — Reorder ResultsBlock, demote SaveToAppCard, remove MobileAppCta

**Files:**
- Modify: `src/app/find-vestings/FindVestingsClient.tsx` — `ResultsBlock` function and `MobileAppCta` deletion

Swap the order of the results view to: `ResultsSummary` → `DownloadGate` → teaser cards → `SaveToAppCard`. Remove `MobileAppCta` (store badges are now in `DownloadGate`). Update `StickyAppBar` button label from `"Open"` to `"Get the app"` to match messaging for first-time users.

- [ ] **Step 1: Rewrite `ResultsBlock`**

  Find the current `ResultsBlock` function. Replace its return JSX with:

  ```tsx
  return (
    <>
      <ResultsSummary result={result} />

      {/* Primary conversion gate — store download badges, directly after summary */}
      <DownloadGate
        totalStreams={result.totalStreams}
        walletAddress={result.address}
        primarySymbol={primarySymbol}
      />

      {/* Teaser cards — protocol/chain/symbol visible, amounts blurred */}
      <div className="grid grid-cols-1 gap-3">
        {result.groups.map((g) => (
          <TeaserCard
            key={`${g.protocolId}-${g.chainId}`}
            group={g}
            walletAddress={result.address}
          />
        ))}
      </div>

      {/* Secondary conversion — email capture, demoted to below the cards */}
      <SaveToAppCard walletAddress={result.address} />

      <StickyAppBar
        totalStreams={result.totalStreams}
        walletAddress={result.address}
        anchorRef={stripRef}
      />
    </>
  );
  ```

  Also update the `stripRef` to observe the `DownloadGate` instead of the old strip. Wrap `DownloadGate` in the ref div:

  ```tsx
  <div ref={stripRef}>
    <DownloadGate
      totalStreams={result.totalStreams}
      walletAddress={result.address}
      primarySymbol={primarySymbol}
    />
  </div>
  ```

- [ ] **Step 2: Delete `MobileAppCta` function and its call site**

  **Step 2a — Remove the call site first.** The call site is NOT in `ResultsBlock`.
  It lives in the top-level `FindVestingsClient` return, inside the
  `{result && !loading && (...)}` branch, at approximately line 312:

  ```tsx
  {result && !loading && (
    <>
      {result.totalStreams === 0 ? (
        <NoResults address={result.address} />
      ) : (
        <ResultsBlock result={result} />
      )}

      <MobileAppCta hasResults={result.totalStreams > 0} />   {/* ← remove this line */}
    </>
  )}
  ```

  Remove just the `<MobileAppCta ...>` line. Leave the surrounding conditional intact.

  **Step 2b — Delete the `MobileAppCta` function.** Find and remove the entire
  function body. It begins:
  ```tsx
  function MobileAppCta({ hasResults }: { hasResults: boolean }) {
  ```
  and ends with its closing `}`. Also delete the `AppStoreBadge` and `PlayStoreBadge`
  helper functions that are only used by `MobileAppCta` (the new `DownloadGate`
  has its own inline badge markup). Confirm neither helper is referenced elsewhere
  before deleting.

- [ ] **Step 3: Update StickyAppBar button label**

  In `StickyAppBar`, find the `TrackInAppCTA` child text:
  ```tsx
  Open
  ```
  Replace with:
  ```tsx
  Get the app
  ```

- [ ] **Step 4: Update `SaveToAppCard` heading copy (optional polish)**

  The existing heading "Continue in the app" is fine. Optionally update the sub-copy to make it explicit this is a secondary/desktop fallback:

  Find:
  ```tsx
  Drop in your email — we&rsquo;ll have this scan waiting when you sign into the mobile app. No password, just the same email and an OTP.
  ```
  Replace with:
  ```tsx
  On desktop? Drop your email — this scan will be waiting when you open the app. No password, just OTP sign-in.
  ```

- [ ] **Step 5: Verify build**

  ```bash
  cd /Users/howardpearce/vestr && npm run build 2>&1 | tail -20
  ```

  Expected: zero errors, zero unused variable warnings.

- [ ] **Step 6: Commit**

  ```bash
  git add src/app/find-vestings/FindVestingsClient.tsx
  git commit -m "feat: reorder results — DownloadGate above cards, demote SaveToAppCard, remove MobileAppCta"
  ```

---

## Verification Checklist

Run after all four tasks are committed. Use the Vestream preview server.

**Desktop (1440px)**
- [ ] Scan a test wallet that has results (e.g. the Sepolia test address from dev)
- [ ] "Scan complete — X vestings found" summary renders at top
- [ ] Teal `DownloadGate` renders immediately below summary, above cards
- [ ] `DownloadGate` shows: headline, two store badge buttons (black), notification mockup to the right
- [ ] Clicking "Download on the App Store" → opens real App Store URL in new tab
- [ ] Clicking "Get it on Google Play" → opens real Play Store URL in new tab
- [ ] Token amount rows in cards are visibly blurred/unreadable
- [ ] "See amounts →" or "Claim in app →" CTA visible on each blurred token row
- [ ] `SaveToAppCard` email form is below all protocol cards
- [ ] No `MobileAppCta` dark section at the bottom
- [ ] Scrolling down triggers sticky bar showing "Get the app"

**Mobile (375px)**
- [ ] Notification mockup renders below the store badges (stacked layout)
- [ ] Both store badge buttons fit without horizontal overflow
- [ ] Blurred amounts readable as blurred (not invisible — the text shape should be visible but unreadable)
- [ ] Sticky bar "Get the app" visible after scrolling past DownloadGate

**No results path**
- [ ] Scan a wallet with no vestings — `NoResults` component renders, no DownloadGate/TeaserCards

**Edge cases**
- [ ] Wallet with >4 tokens in one group — "+ N more tokens in app" line renders
- [ ] All tokens claimable — all overlay CTAs show green "Claim in app →"

---

## Rollback

All changes are in one file. To revert Tasks 2–4 while keeping the Task 1 link fix:
```bash
git revert HEAD~2..HEAD   # reverts the 3 commits from Tasks 2, 3, and 4
```

Task 1 (broken `AppStoreBadge` link fix) should be kept regardless — it's an unconditional improvement that applies even without the full redesign.
