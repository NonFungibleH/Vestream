UpsellModal from vestr. Use via `window.Vestream.UpsellModal` (bundle loaded from the root `_ds_bundle.js`).

## Props

```ts
interface UpsellModalProps {
featureName: string;
  requiredTier: "pro" | "fund";
  onClose: () => void;
}
```

## Examples

### ProUpgrade

```jsx
() => (
  <div style={{ minHeight: 460 }}>
    <UpsellModal featureName="the Vesting Explorer" requiredTier="pro" onClose={noop} />
  </div>
)
```
