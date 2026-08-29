ContactModal from vestr. Use via `window.Vestream.ContactModal` (bundle loaded from the root `_ds_bundle.js`).

## Props

```ts
interface ContactModalProps {
open: boolean;
  onClose: () => void;
}
```

## Examples

### Open

```jsx
() => (
  <div style={{ minHeight: 460 }}>
    <ContactModal open onClose={() => {}} />
  </div>
)
```
