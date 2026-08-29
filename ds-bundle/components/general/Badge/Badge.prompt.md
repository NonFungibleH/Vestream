Badge from vestr. Use via `window.Vestream.Badge` (bundle loaded from the root `_ds_bundle.js`).

## Props

```ts
interface BadgeProps {
variant?: "default" | "secondary" | "destructive" | "outline" | "ghost" | "link";
  /** Render as the child element instead of a <span> (Radix Slot). */
  asChild?: boolean;
  className?: string;
  children?: React.ReactNode;
}
```

## Examples

### Variants

```jsx
() => (
  <div className="flex flex-wrap items-center gap-2">
    <Badge>Pro</Badge>
    <Badge variant="secondary">Free</Badge>
    <Badge variant="outline">Beta</Badge>
    <Badge variant="destructive">Cancelled</Badge>
    <Badge variant="ghost">Draft</Badge>
  </div>
)
```

### InContext

```jsx
() => (
  <div className="flex flex-wrap items-center gap-2">
    <Badge variant="outline">Sablier</Badge>
    <Badge variant="outline">Hedgey</Badge>
    <Badge variant="outline">UNCX</Badge>
    <Badge variant="outline">Ethereum</Badge>
    <Badge variant="outline">Base</Badge>
    <Badge>Unlocks in 3d</Badge>
  </div>
)
```
