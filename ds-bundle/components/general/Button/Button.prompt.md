Button from vestr. Use via `window.Vestream.Button` (bundle loaded from the root `_ds_bundle.js`).

## Props

```ts
interface ButtonProps {
variant?: "default" | "secondary" | "destructive" | "outline" | "ghost" | "link";
  size?: "default" | "xs" | "sm" | "lg" | "icon" | "icon-xs" | "icon-sm" | "icon-lg";
  /** Render as the child element instead of a <button> (Radix Slot). */
  asChild?: boolean;
  className?: string;
  disabled?: boolean;
  type?: "button" | "submit" | "reset";
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
  children?: React.ReactNode;
}
```

## Examples

### Variants

```jsx
() => (
  <div className="flex flex-wrap items-center gap-3">
    <Button>Scan your wallet</Button>
    <Button variant="secondary">Secondary</Button>
    <Button variant="outline">Outline</Button>
    <Button variant="ghost">Ghost</Button>
    <Button variant="destructive">Delete wallet</Button>
    <Button variant="link">Learn more</Button>
  </div>
)
```

### Sizes

```jsx
() => (
  <div className="flex flex-wrap items-center gap-3">
    <Button size="xs">Extra small</Button>
    <Button size="sm">Small</Button>
    <Button size="default">Default</Button>
    <Button size="lg">Large</Button>
  </div>
)
```

### States

```jsx
() => (
  <div className="flex flex-wrap items-center gap-3">
    <Button>Default</Button>
    <Button disabled>Disabled</Button>
    <Button variant="outline" disabled>Disabled outline</Button>
  </div>
)
```
