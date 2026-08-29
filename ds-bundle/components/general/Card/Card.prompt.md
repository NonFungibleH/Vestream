Card from vestr. Use via `window.Vestream.Card` (bundle loaded from the root `_ds_bundle.js`).

## Props

```ts
interface CardProps {
className?: string;
  children?: React.ReactNode;
}
```

## Examples

### Default

```jsx
() => (
  <Card style={{ maxWidth: 420 }}>
    <CardHeader>
      <CardTitle>Total locked</CardTitle>
      <CardDescription>Across all tracked wallets</CardDescription>
      <CardAction><Badge variant="outline">Pro</Badge></CardAction>
    </CardHeader>
    <CardContent>
      <div className="text-3xl font-semibold" style={{ letterSpacing: "-0.02em" }}>$2,847,120</div>
      <div className="text-sm mt-1" style={{ color: "#8B8E92" }}>+4.2% since last unlock</div>
    </CardContent>
    <CardFooter>
      <Button size="sm">View streams</Button>
    </CardFooter>
  </Card>
)
```

### Minimal

```jsx
() => (
  <Card style={{ maxWidth: 420 }}>
    <CardHeader>
      <CardTitle>Next unlock</CardTitle>
      <CardDescription>NOVA · Sablier · Ethereum</CardDescription>
    </CardHeader>
    <CardContent>
      <div className="text-2xl font-semibold" style={{ letterSpacing: "-0.02em" }}>12,500 NOVA</div>
    </CardContent>
  </Card>
)
```
