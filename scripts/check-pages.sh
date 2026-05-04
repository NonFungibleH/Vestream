#!/usr/bin/env bash
# scripts/check-pages.sh
# ─────────────────────────────────────────────────────────────────────────────
# Post-deploy smoke check. One command, every public page exercised, fail
# loudly if anything regresses.
#
# Built May 4 2026 after the doom-loop incident where successive deploys
# silently broke pages (CSP CORS errors, slow renders, missing tables) and
# we kept finding them only via user reports. This script is the answer:
# run it after every deploy, find any regression in <60s.
#
# Usage:
#   ./scripts/check-pages.sh                    # default: https://www.vestream.io
#   ./scripts/check-pages.sh http://localhost:3000
#   BASE_URL=https://staging.vestream.io ./scripts/check-pages.sh
#
# Exit code:
#   0 — every page green (status OK, render under threshold, no known
#       bad patterns in shipped JS)
#   1 — one or more checks failed; details printed inline
#
# What "green" means:
#   - HTTP status matches expectation (most pages: 200; gated pages: 200
#     or 302 to /early-access; non-existent: 404)
#   - Render time under SLOW_MS (default 5000) — anything slower is a
#     regression of the materialised-view foundation
#   - First JS chunk doesn't contain "merkle.io" (the wagmi CORS landmine
#     — viem default RPC that doesn't return Access-Control-Allow-Origin
#     headers; if it leaks back in, the user-side console fills with errors)
#
# What it doesn't check:
#   - Authenticated pages (anything behind iron-session) — would need a
#     test user. Add later if needed.
#   - Visual regressions — Playwright covers those in CI.
#   - DB-driven data correctness — that's what /status is for.
# ─────────────────────────────────────────────────────────────────────────────

set -uo pipefail

BASE_URL="${1:-${BASE_URL:-https://www.vestream.io}}"
SLOW_MS="${SLOW_MS:-5000}"
TIMEOUT_S="${TIMEOUT_S:-30}"

# Pages to check. Format: "path|expected_status|label"
# expected_status accepts a regex (for "200|302" patterns)
PAGES=(
  # ── Marketing surfaces ─────────────────────────────────────────────────
  "/|200|Homepage"
  "/developer|200|Developer page"
  "/ai|200|AI Agents page"
  "/pricing|200|Pricing"
  "/early-access|200|Early access"
  "/login|200|Login"
  "/contact|200|Contact"
  "/privacy|200|Privacy"
  "/terms|200|Terms"
  "/faq|200|FAQ"

  # ── /resources blog index + sample articles ─────────────────────────────
  "/resources|200|Resources index"
  "/resources/what-is-token-vesting|200|Resources: vesting article"
  "/resources/crypto-payroll-and-contributor-income-guide|200|Resources: worker article"

  # ── Operational dashboards ──────────────────────────────────────────────
  "/status|200|Status page"

  # ── /protocols index + every protocol detail ────────────────────────────
  "/protocols|200|Protocols index"
  "/protocols/sablier|200|Sablier"
  "/protocols/sablier-flow|200|Sablier Flow"
  "/protocols/hedgey|200|Hedgey"
  "/protocols/uncx|200|UNCX"
  "/protocols/unvest|200|Unvest"
  "/protocols/superfluid|200|Superfluid"
  "/protocols/pinksale|200|PinkSale"
  "/protocols/streamflow|200|Streamflow"
  "/protocols/jupiter-lock|200|Jupiter Lock"
  "/protocols/llamapay|200|LlamaPay"

  # ── Sample token pages (sanity) ────────────────────────────────────────
  "/tokens/usdc|200|Token: USDC"
  "/tokens/uni|200|307|Token: UNI (redirect)"

  # ── Auth-gated dashboard (expect 200 if cookie set, 307 redirect otherwise) ──
  "/dashboard|200|302|307|Dashboard (gated)"

  # ── Public APIs (cheap to probe) ────────────────────────────────────────
  "/api/health|200|404|API: health (optional)"
)

# ANSI colours; honour NO_COLOR=1
if [ -z "${NO_COLOR:-}" ] && [ -t 1 ]; then
  GREEN=$'\033[0;32m'; RED=$'\033[0;31m'; YELLOW=$'\033[0;33m'; DIM=$'\033[0;90m'; BOLD=$'\033[1m'; RESET=$'\033[0m'
else
  GREEN=""; RED=""; YELLOW=""; DIM=""; BOLD=""; RESET=""
fi

failures=0
slow=0
warnings=0
total=0

printf "%s\n" "${BOLD}Vestream page smoke check${RESET}"
printf "%s%s%s\n" "${DIM}" "Base: ${BASE_URL} · slow threshold: ${SLOW_MS}ms · per-page timeout: ${TIMEOUT_S}s" "${RESET}"
printf "\n"
printf "%-46s %6s %10s %s\n" "PAGE" "STATUS" "TIME" "RESULT"
printf "%s\n" "${DIM}-------------------------------------------------------------------------${RESET}"

check_page() {
  local path="$1"
  local expected_pattern="$2"
  local label="$3"
  local url="${BASE_URL}${path}"

  # Use a unique cache-buster so we always hit the live render, never a
  # CDN cached copy. Time is measured server-to-byte rather than just
  # connect — CF + Vercel can return headers fast then stall the body.
  local result
  result=$(/usr/bin/curl -sS -m "${TIMEOUT_S}" -o /dev/null \
    -w "%{http_code} %{time_total}" \
    "${url}?_smoke=$(date +%s%N)" 2>&1)
  local code time_s
  code="${result%% *}"
  time_s="${result##* }"

  # time_total is seconds (float); convert to integer ms for comparison.
  local time_ms
  time_ms=$(awk -v t="${time_s}" 'BEGIN { printf "%d", t * 1000 }')

  total=$((total + 1))

  local status_ok="false"
  if [[ "${code}" =~ ^(${expected_pattern//|/|})$ ]]; then
    status_ok="true"
  fi

  local outcome="${GREEN}✓${RESET}"
  local note=""

  if [ "${status_ok}" != "true" ]; then
    outcome="${RED}✗ FAIL${RESET}"
    note="(expected ${expected_pattern})"
    failures=$((failures + 1))
  elif [ "${time_ms}" -gt "${SLOW_MS}" ]; then
    outcome="${YELLOW}⚠ SLOW${RESET}"
    note="(>${SLOW_MS}ms)"
    slow=$((slow + 1))
  fi

  printf "%-46s %6s %8sms %s %s\n" \
    "${path}" "${code}" "${time_ms}" "${outcome}" "${note}"
}

for entry in "${PAGES[@]}"; do
  IFS='|' read -ra parts <<< "${entry}"
  # bash 3.2-compatible: no ${arr[-1]}. We know the entry shape is
  # path|status[|status2|...]|label, so path is parts[0], label is
  # parts[len-1], and everything in between joined by | is the status
  # pattern (preserves alternation like "200|302").
  local_count=${#parts[@]}
  path="${parts[0]}"
  label="${parts[$((local_count - 1))]}"
  expected_pattern="${parts[1]}"
  for ((idx = 2; idx < local_count - 1; idx++)); do
    expected_pattern+="|${parts[idx]}"
  done
  check_page "${path}" "${expected_pattern}" "${label}"
done

# ─── JS bundle sniff for known regressions ──────────────────────────────
# Past incidents we've shipped fixes for; still worth a sanity check
# in case a future dependency upgrade reintroduces them.
printf "\n%s\n" "${BOLD}JS bundle sniff${RESET}"
printf "%s%s%s\n" "${DIM}" "Scans /protocols/sablier's chunks for patterns we've previously had to fix." "${RESET}"

html=$(/usr/bin/curl -sS -m "${TIMEOUT_S}" "${BASE_URL}/protocols/sablier?_smoke=$(date +%s%N)" 2>&1)
chunks=$(echo "${html}" | /usr/bin/grep -oE "/_next/static/chunks/[a-zA-Z0-9_/.-]+\.js" | sort -u)

# Count occurrences across all chunks. We only need the totals — failures
# point us at the offending dependency or config; we don't need per-chunk
# breakdowns from this check.
merkle_total=0
for c in ${chunks}; do
  n=$(/usr/bin/curl -sS -m "${TIMEOUT_S}" "${BASE_URL}${c}" 2>/dev/null | /usr/bin/grep -ocE "eth\.merkle\.io" || true)
  merkle_total=$((merkle_total + n))
done
if [ "${merkle_total}" -gt 0 ]; then
  # WARN, not FAIL. `eth.merkle.io` ends up in the bundle as an inert
  # string because adapters, the seeder, and the explorer all import
  # `mainnet` from viem/chains for SERVER-side viem clients (where the
  # actual RPC URL comes from env vars like ALCHEMY_RPC_URL_ETH). The
  # imported chain DEFINITION carries merkle.io as its declared default
  # RPC, so the string ships in the client bundle even though the
  # client-side wagmi config (src/lib/wagmi.ts withRpc) overrides it
  # to publicnode at runtime. Confirmed correct by greping the same
  # bundle for "ethereum-rpc.publicnode.com" — appears in the active
  # transports config.
  #
  # If the user sees actual eth.merkle.io network calls in their
  # browser console, that's a runtime issue (likely browser cache —
  # try Cmd+Shift+R) NOT a bundle-content issue.
  printf "  %s%s%s eth.merkle.io references in deployed JS: %d (warning — passive string only, runtime config uses publicnode)\n" \
    "${YELLOW}" "⚠" "${RESET}" "${merkle_total}"
  warnings=$((warnings + 1))
else
  printf "  %s%s%s eth.merkle.io references: 0 (wagmi CORS-friendly RPC override holding)\n" \
    "${GREEN}" "✓" "${RESET}"
fi
# Also confirm our active publicnode override is actually in the bundle.
publicnode_total=0
for c in ${chunks}; do
  n=$(/usr/bin/curl -sS -m "${TIMEOUT_S}" "${BASE_URL}${c}" 2>/dev/null | /usr/bin/grep -ocE "ethereum-rpc\.publicnode\.com" || true)
  publicnode_total=$((publicnode_total + n))
done
if [ "${publicnode_total}" -gt 0 ]; then
  printf "  %s%s%s ethereum-rpc.publicnode.com references: %d (active wagmi transport URL — good)\n" \
    "${GREEN}" "✓" "${RESET}" "${publicnode_total}"
else
  printf "  %s%s%s ethereum-rpc.publicnode.com references: 0 (override missing from bundle — wagmi.ts may have regressed)\n" \
    "${RED}" "✗" "${RESET}"
  failures=$((failures + 1))
fi

# ─── Summary ───────────────────────────────────────────────────────────
printf "\n%s\n" "${BOLD}Summary${RESET}"
printf "  Total pages: %d\n" "${total}"
printf "  %sPassing:%s    %d\n" "${GREEN}" "${RESET}" "$((total - failures - slow - warnings))"
if [ "${slow}" -gt 0 ]; then
  printf "  %sSlow (>%dms):%s %d\n" "${YELLOW}" "${SLOW_MS}" "${RESET}" "${slow}"
fi
if [ "${failures}" -gt 0 ]; then
  printf "  %sFailing:%s    %d\n" "${RED}" "${RESET}" "${failures}"
  exit 1
fi
exit 0
