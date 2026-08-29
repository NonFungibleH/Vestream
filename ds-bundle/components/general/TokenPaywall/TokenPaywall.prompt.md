TokenPaywall from vestr. Use via `window.Vestream.TokenPaywall` (bundle loaded from the root `_ds_bundle.js`).

## Props

```ts
interface TokenPaywallProps {
chainId: number;
  address: string;
  symbol: string;
}
```

## Examples

### Walled

```jsx
() => (
  <div style={{ maxWidth: 720, minHeight: 420 }}>
    <TokenPaywall chainId={1} address="0x1a4cD8b2f9e0c7A6d5E4f3B2a1C0d9E8f7A6b2d8" symbol="NOVA" />
  </div>
)
```
