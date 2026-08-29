TokenMetaPanel from vestr. Use via `window.Vestream.TokenMetaPanel` (bundle loaded from the root `_ds_bundle.js`).

## Props

```ts
interface TokenMetaPanelProps {
chainId: number;
  tokenAddress: string;
  /** Required – used for the X search query + labels. May be null for tokens with no resolved symbol. */
  tokenSymbol: string | null;
  market: TokenMarketData;
  overview: TokenOverview;
}
```
