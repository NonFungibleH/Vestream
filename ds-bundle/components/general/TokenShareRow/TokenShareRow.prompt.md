TokenShareRow from vestr. Use via `window.Vestream.TokenShareRow` (bundle loaded from the root `_ds_bundle.js`).

## Props

```ts
interface TokenShareRowProps {
/** Full page URL – e.g. https://www.vestream.io/token/1/0x... */
  pageUrl: string;
  /** Token symbol, used in the tweet text. */
  symbol: string;
  /** Chain name, used in tweet text. */
  chainName: string;
  /** Optional short summary of locked TVL for the tweet, e.g. "$2.8M". */
  lockedSummary?: string | null;
}
```

## Examples

### Default

```jsx
() => (
  <TokenShareRow
    pageUrl="https://www.vestream.io/token/1/0x1a4c"
    symbol="NOVA"
    chainName="Ethereum"
    lockedSummary="$2.8M"
  />
)
```

### WithoutLockedSummary

```jsx
() => (
  <TokenShareRow pageUrl="https://www.vestream.io/token/8453/0x9B8a" symbol="FLUX" chainName="Base" />
)
```
