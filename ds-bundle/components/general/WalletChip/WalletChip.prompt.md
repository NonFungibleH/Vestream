WalletChip from vestr. Use via `window.Vestream.WalletChip` (bundle loaded from the root `_ds_bundle.js`).

## Props

```ts
interface WalletChipProps {
address: string;
  open: boolean;
  onToggle: (e: React.MouseEvent) => void;
  onDisconnect: () => void;
}
```

## Examples

### Collapsed

```jsx
() => (
  <WalletChip address={RECIPIENT} open={false} onToggle={noop} onDisconnect={noop} />
)
```

### Open

```jsx
() => (
  <div style={{ minHeight: 180 }}>
    <WalletChip address={RECIPIENT} open onToggle={noop} onDisconnect={noop} />
  </div>
)
```
