TvlComparisonBar from vestr. Use via `window.Vestream.TvlComparisonBar` (bundle loaded from the root `_ds_bundle.js`).

## Props

```ts
interface TvlComparisonBarProps {
rows: TvlComparisonRow[];
  /** Protocol slugs whose TVL came from an external source (DefiLlama) rather than our own priced-cache computation. */
  externallySourced?: Set<string>;
  /** Age of the oldest snapshot row (hours) — "last verified X ago". Null when no snapshot exists yet. */
  snapshotAgeHours?: number | null;
}
```

## Examples

### Default

```jsx
() => (
  <TvlComparisonBar
    rows={ROWS}
    externallySourced={new Set(["sablier", "streamflow", "hedgey"])}
    snapshotAgeHours={6}
  />
)
```
