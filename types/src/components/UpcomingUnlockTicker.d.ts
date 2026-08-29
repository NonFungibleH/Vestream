/**
 * Wire shape returned by `/api/unlocks/upcoming`. Each entry is a group of
 * streams sharing protocol/chain/token and unlocking in the same 1-hour
 * window. `walletCount === 1` means a single-stream group (legacy single-
 * wallet phrasing); `walletCount > 1` triggers the "N wallets" rollup.
 *
 * `streamId` and `recipient` carry the *first* (earliest) member of the
 * group – kept so single-stream groups behave like before, and so groups
 * still have a deterministic React key. New consumers should prefer
 * `groupKey` for keying.
 */
type UpcomingRow = {
    streamId: string;
    protocol: string;
    chainId: number;
    tokenSymbol: string | null;
    tokenAddress: string;
    tokenDecimals: number;
    recipient: string;
    amount: string | null;
    endTime: number | null;
    walletCount: number;
    streamCount: number;
    groupKey: string;
    /** Optional USD-equivalent attached server-side. Undefined when the
     *  token has no liquid DEX pair on its chain. */
    usdValue?: number | null;
};
type UpcomingResponse = {
    ok: true;
    nowMs: number;
    unlocks: UpcomingRow[];
};
export declare function UpcomingUnlockTicker({ initialData }: {
    initialData?: UpcomingResponse | null;
}): import("react/jsx-runtime").JSX.Element;
declare function UpcomingRow({ row, nowMs }: {
    row: UpcomingRow;
    nowMs: number;
}): import("react/jsx-runtime").JSX.Element;
export {};
