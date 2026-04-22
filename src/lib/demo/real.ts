// src/lib/demo/real.ts
// ─────────────────────────────────────────────────────────────────────────────
// Sepolia on-chain demo integration — activated only when the following env
// vars are set (see config.ts `getDemoMode`):
//
//   SEPOLIA_RPC_URL                 Sepolia RPC endpoint (Alchemy / Infura / PublicNode)
//   DEMO_HOT_WALLET_PRIVATE_KEY     Funded hot wallet — pays gas, holds DEMO tokens
//   DEMO_TOKEN_ADDRESS              ERC20 token address deployed on Sepolia
//   DEMO_VESTING_FACTORY_ADDRESS    (optional) factory that deploys per-recipient vestings
//   DEMO_VESTING_ADDRESS            (optional) single shared OpenZeppelin VestingWallet
//
// Strategy (shared-wallet mode, simplest):
//   - A single OpenZeppelin VestingWallet is deployed on Sepolia with the hot
//     wallet as beneficiary. It releases 1000 DEMO linearly over 15 minutes.
//   - When a user starts the demo, we store the vesting address in their
//     session cookie so they can watch it tick.
//   - "Claim" calls `release(token)` on the vesting wallet which sends tokens
//     to the beneficiary (the hot wallet, i.e. itself). User sees the tx go
//     through on Sepolia Etherscan.
//
// If the user wants per-recipient vestings (to give each demo user their own
// claimable balance), they'd need to deploy a factory — covered in a separate
// deploy script (not included here). This file supports both via env vars.
// ─────────────────────────────────────────────────────────────────────────────

import { createPublicClient, createWalletClient, http, parseAbi, type Address, type Hash } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { DEMO_CONFIG, SEPOLIA_CONFIG } from "./config";
import type { DemoSession, DemoVestingState } from "./types";

// ── ABIs ─────────────────────────────────────────────────────────────────────

const VESTING_WALLET_ABI = parseAbi([
  "function start() view returns (uint256)",
  "function duration() view returns (uint256)",
  "function released(address token) view returns (uint256)",
  "function releasable(address token) view returns (uint256)",
  "function vestedAmount(address token, uint64 timestamp) view returns (uint256)",
  "function beneficiary() view returns (address)",
  "function release(address token)",
]);

const ERC20_ABI = parseAbi([
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
]);

// ── Clients ──────────────────────────────────────────────────────────────────

function getClients() {
  const rpc = process.env.SEPOLIA_RPC_URL;
  const pk  = process.env.DEMO_HOT_WALLET_PRIVATE_KEY as `0x${string}` | undefined;
  if (!rpc || !pk) throw new Error("Sepolia demo not configured");

  const account = privateKeyToAccount(pk);
  const publicClient = createPublicClient({ chain: sepolia, transport: http(rpc) });
  const walletClient = createWalletClient({ chain: sepolia, transport: http(rpc), account });
  return { publicClient, walletClient, account };
}

function getVestingAddress(): Address {
  const addr = (process.env.DEMO_VESTING_ADDRESS || process.env.DEMO_VESTING_FACTORY_ADDRESS) as Address | undefined;
  if (!addr) throw new Error("DEMO_VESTING_ADDRESS not set");
  return addr;
}

function getTokenAddress(): Address {
  const addr = process.env.DEMO_TOKEN_ADDRESS as Address | undefined;
  if (!addr) throw new Error("DEMO_TOKEN_ADDRESS not set");
  return addr;
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Snapshot the vesting wallet's on-chain state and return it in the shared
 * DemoVestingState shape.
 */
export async function readRealState(session: DemoSession | null | undefined): Promise<DemoVestingState> {
  const vestingAddress = session?.vestingAddress as Address | undefined || getVestingAddress();
  const tokenAddress   = getTokenAddress();
  const { publicClient } = getClients();

  // Parallel reads — all view functions, cheap
  const [start, duration, released, releasable, symbol, decimals] = await Promise.all([
    publicClient.readContract({ address: vestingAddress, abi: VESTING_WALLET_ABI, functionName: "start" }),
    publicClient.readContract({ address: vestingAddress, abi: VESTING_WALLET_ABI, functionName: "duration" }),
    publicClient.readContract({ address: vestingAddress, abi: VESTING_WALLET_ABI, functionName: "released",   args: [tokenAddress] }),
    publicClient.readContract({ address: vestingAddress, abi: VESTING_WALLET_ABI, functionName: "releasable", args: [tokenAddress] }),
    publicClient.readContract({ address: tokenAddress,   abi: ERC20_ABI,          functionName: "symbol"       }).catch(() => DEMO_CONFIG.tokenSymbol),
    publicClient.readContract({ address: tokenAddress,   abi: ERC20_ABI,          functionName: "decimals"     }).catch(() => DEMO_CONFIG.tokenDecimals),
  ]);

  const startMs      = Number(start) * 1000;
  const durationMs   = Number(duration) * 1000;
  const endMs        = startMs + durationMs;
  const nowMs        = Date.now();
  const elapsed      = Math.max(0, Math.min(nowMs - startMs, durationMs));
  const progress     = durationMs > 0 ? elapsed / durationMs : 0;
  const remainingSec = Math.max(0, Math.ceil((endMs - nowMs) / 1000));

  const total        = BigInt(released) + BigInt(releasable) + BigInt(await lockedRemaining(publicClient, vestingAddress, tokenAddress, released, releasable));
  const vested       = BigInt(released) + BigInt(releasable);
  const withdrawn    = BigInt(released);
  const claimableNow = BigInt(releasable);
  const locked       = total > vested ? total - vested : 0n;

  return {
    sessionId:      session?.sessionId ?? null,
    mode:           "sepolia",
    active:         !!session?.sessionId,
    startMs,
    endMs,
    remainingSec,
    progress,
    tokenSymbol:    String(symbol) || DEMO_CONFIG.tokenSymbol,
    tokenDecimals:  Number(decimals) || DEMO_CONFIG.tokenDecimals,
    total:          total.toString(),
    vested:         vested.toString(),
    claimableNow:   claimableNow.toString(),
    withdrawn:      withdrawn.toString(),
    locked:         locked.toString(),
    vestingAddress,
    lastClaimTx:    session?.lastClaimTx ?? null,
    explorerUrl:    `${SEPOLIA_CONFIG.explorerBase}/address/${vestingAddress}`,
  };
}

/**
 * The VestingWallet doesn't expose `total()` directly; we approximate it by
 * `balanceOf(vesting) + released`. This assumes the funding tx has landed.
 */
async function lockedRemaining(
  publicClient: ReturnType<typeof getClients>["publicClient"],
  vestingAddress: Address,
  tokenAddress:   Address,
  released: unknown,
  releasable: unknown
): Promise<bigint> {
  const bal = await publicClient.readContract({ address: tokenAddress, abi: ERC20_ABI, functionName: "balanceOf", args: [vestingAddress] });
  // locked = balance of the vesting contract MINUS what's already releasable
  const balance = BigInt(bal as bigint);
  const rel     = BigInt(releasable as bigint);
  const _unused = BigInt(released as bigint);
  void _unused;
  return balance > rel ? balance - rel : 0n;
}

/**
 * Broadcast a release(token) tx against the VestingWallet. Returns the tx hash.
 * Safe to call even if nothing is releasable — the tx will simply move 0 tokens.
 */
export async function sendRealClaim(): Promise<Hash> {
  const vestingAddress = getVestingAddress();
  const tokenAddress   = getTokenAddress();
  const { walletClient, publicClient } = getClients();

  const { request } = await publicClient.simulateContract({
    address:      vestingAddress,
    abi:          VESTING_WALLET_ABI,
    functionName: "release",
    args:         [tokenAddress],
    account:      walletClient.account,
  });

  return walletClient.writeContract(request);
}
