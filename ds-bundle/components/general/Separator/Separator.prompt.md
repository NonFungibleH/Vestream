Separator from vestr. Use via `window.Vestream.Separator` (bundle loaded from the root `_ds_bundle.js`).

## Props

```ts
interface SeparatorProps {
orientation?: "horizontal" | "vertical";
  /** Purely visual — hidden from assistive tech (default true). */
  decorative?: boolean;
  className?: string;
}
```

## Examples

### Horizontal

```jsx
() => (
  <div style={{ maxWidth: 420 }}>
    <div className="text-sm font-semibold" style={{ color: "#1A1D20" }}>Vesting streams</div>
    <div className="text-sm" style={{ color: "#8B8E92" }}>Across 9 protocols</div>
    <Separator className="my-4" />
    <div className="text-sm font-semibold" style={{ color: "#1A1D20" }}>Upcoming unlocks</div>
    <div className="text-sm" style={{ color: "#8B8E92" }}>Next 30 days</div>
  </div>
)
```

### Vertical

```jsx
() => (
  <div className="flex items-center gap-4 text-sm" style={{ height: 32, color: "#1A1D20" }}>
    <span>Ethereum</span>
    <Separator orientation="vertical" />
    <span>Base</span>
    <Separator orientation="vertical" />
    <span>BNB Chain</span>
  </div>
)
```
