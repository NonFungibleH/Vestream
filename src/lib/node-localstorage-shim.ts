// Side-effect-only module. Imported by `wagmi.ts` BEFORE any RainbowKit /
// WalletConnect import so the wallet code's `typeof localStorage` guards
// correctly fall back to the no-op branch on the server.
//
// Background: Node 22+ ships an experimental `localStorage` global. On
// startup it's a stub that satisfies `typeof localStorage !== "undefined"`
// but throws `TypeError: this.localStorage.getItem is not a function` when
// any method is invoked. RainbowKit's `getRecentWalletIds()` and the
// WalletConnect ethereum-provider's session restore both call `getItem` /
// `setItem` after the typeof guard passes — so static prerender crashes.
//
// Deleting the global on Node makes the guards safely fall through.
// Browser bundles never run this code (gated on `typeof window`).
if (typeof window === "undefined") {
  try {
    // @ts-expect-error - intentional global mutation
    delete globalThis.localStorage;
  } catch {
    // If the property is non-configurable in some future Node version, the
    // existing TypeError already happens — we can't make it worse.
  }
}

export {};
