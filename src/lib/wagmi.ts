// IMPORTANT: this side-effect import must come first. Node 22+ ships an
// experimental `localStorage` global that satisfies a `typeof localStorage
// !== "undefined"` check but throws on every method call. RainbowKit and
// the WalletConnect ethereum-provider both guard on typeof and crash Next.js
// static prerender as a result. The shim deletes the stub before any wallet
// code loads so the guards correctly fall back to the no-op branch.
import "./node-localstorage-shim";

import { http } from "wagmi";
import { base, baseSepolia, bsc, mainnet, polygon, sepolia } from "wagmi/chains";
import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import {
  metaMaskWallet,
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
// `ssr: true` tells wagmi to use cookieStorage and skip auto-connect on the
// server, which keeps prerender stable for pages that don't actually use
// wallet state.
export const wagmiConfig = getDefaultConfig({
  appName: "Vestream",
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "vestr-dev",
  wallets: [
    {
      groupName: "Popular",
      wallets: [
        metaMaskWallet,
        rainbowWallet,
        coinbaseWallet,
        walletConnectWallet,
        trustWallet,
        phantomWallet,
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
  transports: {
    [mainnet.id]:     http(),
    [base.id]:        http(),
    [bsc.id]:         http(),
    [polygon.id]:     http(),
    [sepolia.id]:     http(),
    [baseSepolia.id]: http(),
  },
  ssr: true,
});
