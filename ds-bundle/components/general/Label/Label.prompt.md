Label from vestr. Use via `window.Vestream.Label` (bundle loaded from the root `_ds_bundle.js`).

## Props

```ts
interface LabelProps {
htmlFor?: string;
  className?: string;
  children?: React.ReactNode;
}
```

## Examples

### Default

```jsx
() => (
  <div className="flex flex-col gap-2" style={{ maxWidth: 380 }}>
    <Label htmlFor="email">Email address</Label>
    <Input id="email" type="email" placeholder="you@company.com" />
  </div>
)
```

### Standalone

```jsx
() => (
  <div className="flex flex-col gap-3">
    <Label>Notification preferences</Label>
    <Label>Tracked wallets</Label>
  </div>
)
```
