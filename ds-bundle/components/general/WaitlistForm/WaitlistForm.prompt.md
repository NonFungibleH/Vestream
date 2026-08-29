WaitlistForm from vestr. Use via `window.Vestream.WaitlistForm` (bundle loaded from the root `_ds_bundle.js`).

## Props

```ts
interface WaitlistFormProps {
/** Render the dark-background variant (developer / AI pages). */
  dark?: boolean;
}
```

## Examples

### OnLight

```jsx
() => (
  <div style={{ background: "#f8fafc", padding: 24 }}><WaitlistForm /></div>
)
```

### OnDark

```jsx
() => (
  <div style={{ background: "#0d0f14", padding: 24 }}><WaitlistForm dark /></div>
)
```
