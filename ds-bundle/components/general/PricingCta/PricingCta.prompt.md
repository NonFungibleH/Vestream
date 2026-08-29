PricingCta from vestr. Use via `window.Vestream.PricingCta` (bundle loaded from the root `_ds_bundle.js`).

## Props

```ts
interface PricingCtaProps {
  /** Button label */
  label: string;
  /** Destination – defaults to the early-access page */
  href?: string;
  /** Tailwind + inline style classNames forwarded to the rendered <a> */
  className?: string;
  style?: CSSProperties;
}
```

## Examples

### Primary

```jsx
() => (
  <PricingCta
    label="Get the app →"
    href="/early-access"
    className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm"
    style={{
      background: "linear-gradient(135deg, #1CB8B8 0%, #0F8A8A 100%)",
      color: "white",
      boxShadow: "0 4px 20px rgba(28,184,184,0.30)",
    }}
  />
)
```

### Ghost

```jsx
() => (
  <PricingCta
    label="Start free"
    href="/early-access"
    className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm"
    style={{
      background: "rgba(28,184,184,0.10)",
      border: "1px solid rgba(28,184,184,0.30)",
      color: "#1CB8B8",
    }}
  />
)
```
