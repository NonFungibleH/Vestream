SiteNav from vestr. Use via `window.Vestream.SiteNav` (bundle loaded from the root `_ds_bundle.js`).

## Props

```ts
interface SiteNavProps {
/**
   * "light" = white/grey consumer pages (default) – homepage, pricing, resources
   * "navy"  = dark navy developer page – /developer
   * "dark"  = near-black AI/technical pages – /ai
   */
  theme?: "light" | "navy" | "dark";
}
```

## Examples

### Light

```jsx
() => <Frame bg="#f8fafc"><SiteNav theme="light" /></Frame>
```

### Navy

```jsx
() => <Frame bg="#0d1b35"><SiteNav theme="navy" /></Frame>
```

### Dark

```jsx
() => <Frame bg="#0d0f14"><SiteNav theme="dark" /></Frame>
```
