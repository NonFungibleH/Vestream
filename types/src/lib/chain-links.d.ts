/**
 * True when `addr` is a real on-chain token address we can build a
 * `/token/[chainId]/[address]` link to — EVM hex or Solana base58. Used to
 * gate token links so symbol-only / placeholder rows don't navigate to a dead
 * page. Previously callers hardcoded an EVM-only `/^0x…{40}$/` test, which made
 * every Solana (Streamflow / Jupiter Lock) token un-clickable.
 */
export declare function isLinkableTokenAddress(addr: string | null | undefined): boolean;
/**
 * Block-explorer URL for a contract on a given chain.
 * EVM chains: Etherscan family. Solana: Solscan.
 */
export declare function blockExplorerUrl(chainId: number, address: string): string | null;
/**
 * Block-explorer URL for a WALLET / account (not a token contract).
 * EVM: /address/. Solana: /account/. Use this for recipients/holders;
 * use `blockExplorerUrl` for the token contract itself.
 */
export declare function blockExplorerAddressUrl(chainId: number, address: string): string | null;
/**
 * Honeypot / safety scanner URL. EVM chains use TokenSniffer; Solana uses
 * RugCheck (the Solana-native equivalent — scans liquidity locks, mint
 * authority, top-holder concentration). Testnets are unsupported on either
 * side.
 */
export declare function tokenSnifferUrl(chainId: number, address: string): string | null;
/**
 * X / Twitter search URL for the token.
 *
 * Strategy: search for `$SYMBOL <truncatedAddress>` because 3-letter symbols
 * are too ambiguous to find the project on their own (`$UNI` hits thousands
 * of irrelevant posts). Including the truncated contract narrows to real
 * discussion of the token while still catching casual "$UNI just pumped"
 * posts that include the address.
 *
 * Caller passes `null` for symbol — we fall back to the full address which
 * is a clean but narrower search.
 */
export declare function xSearchUrl(symbol: string | null, address: string): string | null;
/**
 * Human-readable short name for the block explorer. Useful for the button
 * label — "View on Etherscan" beats "View on block explorer".
 */
export declare function blockExplorerName(chainId: number): string | null;
/**
 * Human-readable short name for the safety-scanner link. Mirrors
 * blockExplorerName — callers render it as "Check on <name>".
 */
export declare function tokenSnifferName(chainId: number): string | null;
