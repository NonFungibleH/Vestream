Input from vestr. Use via `window.Vestream.Input` (bundle loaded from the root `_ds_bundle.js`).

## Props

```ts
interface InputProps {
type?: React.HTMLInputTypeAttribute;
  placeholder?: string;
  value?: string | number;
  defaultValue?: string | number;
  disabled?: boolean;
  className?: string;
  onChange?: React.ChangeEventHandler<HTMLInputElement>;
}
```

## Examples

### Default

```jsx
() => (
  <div className="flex flex-col gap-2" style={{ maxWidth: 380 }}>
    <Label htmlFor="wallet">Wallet address</Label>
    <Input id="wallet" placeholder="0x… or Solana pubkey" />
  </div>
)
```

### Filled

```jsx
() => (
  <div className="flex flex-col gap-2" style={{ maxWidth: 380 }}>
    <Label htmlFor="label">Label (optional)</Label>
    <Input id="label" defaultValue="Team vesting wallet" />
  </div>
)
```

### Types

```jsx
() => (
  <div className="flex flex-col gap-3" style={{ maxWidth: 380 }}>
    <Input type="email" placeholder="you@company.com" />
    <Input type="search" placeholder="Search tokens…" />
    <Input placeholder="Disabled" disabled />
  </div>
)
```
