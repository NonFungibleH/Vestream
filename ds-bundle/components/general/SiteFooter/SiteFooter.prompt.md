SiteFooter from vestr. Use via `window.Vestream.SiteFooter` (bundle loaded from the root `_ds_bundle.js`).

## Props

```ts
interface SiteFooterProps {
/** Colour theme – matches the page background. */
  theme?: "light" | "navy" | "dark";
  /** Optional extra copy line (e.g. "Results may take 10s"). */
  note?: string;
  /** Render the background as a recessed panel (useful on developer/AI). */
  recessed?: boolean;
}
```

## Examples

### Light

```jsx
() => <div style={{ background: "#f8fafc" }}><SiteFooter theme="light" /></div>
```

### Navy

```jsx
() => <div style={{ background: "#0d1b35" }}><SiteFooter theme="navy" /></div>
```

### Dark

```jsx
() => <div style={{ background: "#0d0f14" }}><SiteFooter theme="dark" /></div>
```

### RecessedWithNote

```jsx
() => (
  <div style={{ background: "#0d1b35" }}>
    <SiteFooter theme="navy" recessed note="Results may take 10s on a cold cache." />
  </div>
)
```
