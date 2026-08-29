TokenPulse from vestr. Use via `window.Vestream.TokenPulse` (bundle loaded from the root `_ds_bundle.js`).

## Props

```ts
interface TokenPulseProps {
pulse: PulseOutput;
  /** For the card header and fallback wording. */
  symbol: string;
  /** "light" (default) matches the white public /token page. "dark" swaps to the dashboard's `--preview-*` themed surfaces. */
  variant?: "light" | "dark";
}
```

## Examples

### Light

```jsx
() => <div style={{ maxWidth: 640 }}><TokenPulse pulse={PULSE} symbol="NOVA" /></div>
```

### Dark

```jsx
() => (
  <div className="rounded-2xl p-6" style={{ background: "#0d0f14", maxWidth: 640 }}>
    <TokenPulse pulse={PULSE} symbol="NOVA" variant="dark" />
  </div>
)
```
