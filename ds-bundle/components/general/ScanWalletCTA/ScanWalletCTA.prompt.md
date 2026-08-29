ScanWalletCTA from vestr. Use via `window.Vestream.ScanWalletCTA` (bundle loaded from the root `_ds_bundle.js`).

## Props

```ts
interface ScanWalletCTAProps {
heading?: string;
  sub?: string;
  /** Where this CTA is placed — for analytics attribution. */
  surface?: string;
}
```

## Examples

### Default

```jsx
() => <ScanWalletCTA surface="explore" />
```

### CustomCopy

```jsx
() => (
  <ScanWalletCTA
    heading="See every unlock for this token"
    sub="Paste any wallet — 10 protocols, 9 chains. Free, no sign-up."
    surface="token_page"
  />
)
```
