AppStoreBadges from vestr. Use via `window.Vestream.AppStoreBadges` (bundle loaded from the root `_ds_bundle.js`).

## Props

```ts
interface AppStoreBadgesProps {
/** Centre-align the pair (default) or leave alignment to the parent. */
  align?: "center" | "start";
}
```

## Examples

### Centered

```jsx
() => <AppStoreBadges />
```

### StartAligned

```jsx
() => <AppStoreBadges align="start" />
```
