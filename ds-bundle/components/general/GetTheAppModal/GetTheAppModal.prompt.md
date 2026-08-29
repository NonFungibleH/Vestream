GetTheAppModal from vestr. Use via `window.Vestream.GetTheAppModal` (bundle loaded from the root `_ds_bundle.js`).

## Props

```ts
interface GetTheAppModalProps {
open: boolean;
  onClose: () => void;
}
```

## Examples

### Open

```jsx
() => (
  <div style={{ minHeight: 420 }}>
    <GetTheAppModal open onClose={() => {}} />
  </div>
)
```
