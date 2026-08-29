CopyButton from vestr. Use via `window.Vestream.CopyButton` (bundle loaded from the root `_ds_bundle.js`).

## Props

```ts
interface CopyButtonProps {
/** The full string to copy to clipboard (e.g. the full contract address). */
  value: string;
  /** What to display instead of `value` (e.g. a truncated address). */
  display: string;
  className?: string;
  style?: React.CSSProperties;
}
```

## Examples

### Address

```jsx
() => (
  <div className="flex flex-wrap items-center gap-3">
    <CopyButton value="0x3f5CE5FBFe3E9af3971dD833D26bA9b5C936f8b2e" display="0x3f5CE…8b2e" />
    <CopyButton value="0x1a4cD8b2f9e0c7A6d5E4f3B2a1C0d9E8f7A6b2d8" display="0x1a4c…f2d8" />
  </div>
)
```

### OnDarkSurface

```jsx
() => (
  <div className="rounded-2xl p-6 flex items-center gap-3"
    style={{ background: "#141720", border: "1px solid rgba(255,255,255,0.07)" }}>
    <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.55)" }}>
      Contract
    </span>
    <CopyButton value="0x3f5CE5FBFe3E9af3971dD833D26bA9b5C936f8b2e" display="0x3f5CE…8b2e" />
  </div>
)
```
