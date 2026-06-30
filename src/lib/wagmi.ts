// IMPORTANT: this side-effect import must come first. Node 22+ ships an
// experimental `localStorage` global that satisfies a `typeof localStorage
// !== "undefined"` check but throws on every method call. RainbowKit and
// the WalletConnect ethereum-provider both guard on typeof and crash Next.js
// static prerender as a result. The shim deletes the stub before any wallet
// code loads so the guards correctly fall back to the no-op branch.
import "./node-localstorage-shim";

import { http } from "wagmi";
import { base as _base, baseSepolia as _baseSepolia, bsc as _bsc, mainnet as _mainnet, polygon as _polygon, sepolia as _sepolia } from "wagmi/chains";

// ── CORS-friendly RPC overrides ──────────────────────────────────────────────
//
// We override `rpcUrls.default.http` on each chain definition because:
//
//   - viem/chains' built-in defaults point at endpoints that don't support
//     browser CORS for cross-origin POSTs (mainnet defaults to eth.merkle.io
//     as of 2025+; that endpoint returns no Access-Control-Allow-Origin
//     header so every browser-initiated request hits a preflight failure).
//
//   - Setting `transports[chainId]: http("publicnode-url")` is NOT enough.
//     Wagmi/RainbowKit + multiple viem call sites read
//     `chain.rpcUrls.default.http[0]` DIRECTLY when constructing things
//     like the wallet-connect modal's chain metadata or the EIP-1193
//     provider's chain-data. Those bypass our transport config.
//
//   - The clean fix is overriding the chain definition itself so EVERY
//     consumer (transports, wallet modal, viem fallbacks, etc.) sees the
//     CORS-friendly URL.
//
// publicnode endpoints support CORS by design, are free / no-API-key,
// geo-distributed, and are the same endpoints Uniswap and Aave use.
function withRpc<C extends { rpcUrls: { default: { http: readonly string[] } } }>(
  chain: C,
  url:   string,
): C {
  return {
    ...chain,
    rpcUrls: {
      ...chain.rpcUrls,
      default: { http: [url] },
    },
  };
}

const mainnet     = withRpc(_mainnet,     "https://ethereum-rpc.publicnode.com");
const base        = withRpc(_base,        "https://base-rpc.publicnode.com");
const bsc         = withRpc(_bsc,         "https://bsc-rpc.publicnode.com");
const polygon     = withRpc(_polygon,     "https://polygon-bor-rpc.publicnode.com");
const sepolia     = withRpc(_sepolia,     "https://ethereum-sepolia-rpc.publicnode.com");
const baseSepolia = withRpc(_baseSepolia, "https://base-sepolia-rpc.publicnode.com");
import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import {
  rainbowWallet,
  coinbaseWallet,
  walletConnectWallet,
  trustWallet,
  ledgerWallet,
  safeWallet,
  phantomWallet,
  injectedWallet,
} from "@rainbow-me/rainbowkit/wallets";

// One-stop wallet config powered by RainbowKit's modal.
//
// We pass an explicit `wallets` list because RainbowKit's default roster
// includes `@base-org/account` (Base Smart Account) which is brittle on
// Node static prerender. The list below covers every wallet a typical
// token-vesting recipient is likely to be using.
//
// ── MetaMask: NO explicit metaMaskWallet ────────────────────────────────
// Listing `metaMaskWallet` explicitly was tried (commit 8efc45a) on the
// theory that RainbowKit would dedupe against the EIP-6963 announcement
// and surface a single branded entry in "Installed". In practice the
// dedupe doesn't fire reliably — MetaMask ends up double-listed (or
// worse: shown in "Popular" but NOT in "Installed", which the user
// reported on Apr 29). Phantom dedupes correctly, MetaMask does not.
//
// Restoring the proven-working approach from commit 6de5df1: rely entirely
// on EIP-6963 to surface MetaMask in the "Installed" group when the
// extension is present. RainbowKit auto-renders any EIP-6963-announcing
// wallet without us needing to list a connector. Same mechanism that
// makes Phantom / Magic Eden / Brave Wallet appear in your Installed list.
//
// Mobile trade-off: mobile users lose the one-tap branded MetaMask entry.
// They use `walletConnectWallet` (still in Popular) → scan QR → picks
// MetaMask Mobile from the wallet picker. 2 taps instead of 1 — acceptable
// vs the desktop regression of MetaMask not appearing as Installed at all.
//
// Phantom stays explicit because Phantom on mobile is a primary path for
// our Solana audience and Phantom's dedupe DOES work on desktop.
//
// `injectedWallet` lives in "Other" so non-MetaMask injected wallets
// (Brave, Rabby, etc.) still get a generic "Browser Wallet" entry
// without shipping a connector per provider.
//
// ── WalletConnect projectId ─────────────────────────────────────────────
// Required for both metaMaskWallet's deep link AND the standalone
// walletConnectWallet entry. Fallback "vestr-dev" is for local dev only —
// production MUST set NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID on Vercel.
//
// `ssr: true` tells wagmi to use cookieStorage and skip auto-connect on the
// server, which keeps prerender stable for pages that don't actually use
// wallet state.
// IMPORTANT: appUrl MUST match the actual production origin, not the apex
// domain. WalletConnect compares this against `window.location.origin` and
// emits a warning to the console when they differ — but worse, in some
// versions it triggers a retry loop on origin-verification calls that can
// thrash the page (we've seen this manifest as iOS Safari's "this page
// couldn't load" error sheet on the otherwise-static /login page, where
// nothing else uses wagmi but Providers still mounts it). Production runs
// on www.vestream.io (Vercel + Cloudflare), so that's what we use here.
// If the apex domain ever becomes the canonical, update both values.
export const wagmiConfig = getDefaultConfig({
  appName: "Vestream",
  appDescription: "Track every token unlock across 10 vesting protocols",
  appUrl: "https://www.vestream.io",
  appIcon: "https://www.vestream.io/icons/icon-192.png",
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "vestr-dev",
  wallets: [
    {
      groupName: "Popular",
      wallets: [
        phantomWallet,
        rainbowWallet,
        coinbaseWallet,
        walletConnectWallet,
        trustWallet,
      ],
    },
    {
      groupName: "Other",
      wallets: [ledgerWallet, safeWallet, injectedWallet],
    },
  ],
  // Mainnets we index across the platform (matches CHAIN_IDS in
  // src/lib/vesting/types.ts) plus Sepolia testnets for QA. Adding BSC +
  // Polygon means a user connecting their MetaMask while on those chains
  // doesn't get a "wrong network" prompt before scanning. Solana is
  // intentionally NOT here — it's a non-EVM ecosystem handled separately
  // (we read Solana addresses via the manual paste flow + the future
  // Solana wallet adapter integration).
  chains: [mainnet, base, bsc, polygon, sepolia, baseSepolia],
  // Explicit transport URLs — DO NOT use viem's `http()` default. viem's
  // default Ethereum RPC (eth.merkle.io as of 2025+) does not return
  // Access-Control-Allow-Origin headers for browser-initiated cross-
  // origin POSTs. Result: 12+ CORS preflight failures per page load,
  // visible in console as "blocked by CORS policy: Response to preflight
  // request doesn't pass access control check." Bug observed May 4 2026
  // on /protocols/sablier and every other page that mounts Providers.
  //
  // publicnode endpoints (RPC.publicnode.com) explicitly support CORS for
  // browser apps and are already in our CSP allowlist (*.publicnode.com).
  // Free, no API key, geo-distributed. This is the same approach Uniswap
  // and Aave use for their public-facing dApps.
  //
  // dRPC is the fallback (also CORS-friendly + already in CSP). If a
  // chain's publicnode endpoint is unavailable, viem retries against
  // the second http() transport in the array.
  transports: {
    [mainnet.id]:     http("https://ethereum-rpc.publicnode.com"),
    [base.id]:        http("https://base-rpc.publicnode.com"),
    [bsc.id]:         http("https://bsc-rpc.publicnode.com"),
    [polygon.id]:     http("https://polygon-bor-rpc.publicnode.com"),
    [sepolia.id]:     http("https://ethereum-sepolia-rpc.publicnode.com"),
    [baseSepolia.id]: http("https://base-sepolia-rpc.publicnode.com"),
  },
  ssr: true,
});
