TrackInAppCTA from vestr. Use via `window.Vestream.TrackInAppCTA` (bundle loaded from the root `_ds_bundle.js`).

## Props

```ts
interface TrackInAppCTAProps {
walletAddress?: string;
  /** Optional token symbol context (e.g. "NOVA"). Mobile pre-fills add-wallet. */
  tokenSymbol?: string;
  /** Coarse surface tag for analytics – "find_vestings", "explore", etc. */
  surface: string;
  className?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}
```

## Examples

### Default

```jsx
() => <TrackInAppCTA surface="find_vestings" walletAddress={RECIPIENT} />
```

### WithTokenContext

```jsx
() => (
  <TrackInAppCTA surface="explore" walletAddress={RECIPIENT} tokenSymbol="NOVA">
    Track NOVA in the app →
  </TrackInAppCTA>
)
```
