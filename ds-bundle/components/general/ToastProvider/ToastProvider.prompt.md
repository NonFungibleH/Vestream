ToastProvider from vestr. Use via `window.Vestream.ToastProvider` (bundle loaded from the root `_ds_bundle.js`).

## Props

```ts
interface ToastProviderProps {
/** App subtree that can call useToast(). */
  children: React.ReactNode;
}
```

## Examples

### WrappingContent

```jsx
() => (
  <ToastProvider>
    <div className="rounded-2xl p-6" style={{ background: "white", border: "1px solid rgba(0,0,0,0.07)", maxWidth: 420 }}>
      <div className="text-xs font-semibold uppercase tracking-widest" style={{ color: "#8B8E92" }}>
        Toast context
      </div>
      <div className="text-sm mt-2" style={{ color: "#1A1D20" }}>
        Any descendant can call <code style={{ fontFamily: "monospace" }}>useToast()</code> and raise
        <code style={{ fontFamily: "monospace" }}> success</code>, <code style={{ fontFamily: "monospace" }}>error</code> or
        <code style={{ fontFamily: "monospace" }}> info</code> toasts.
      </div>
    </div>
  </ToastProvider>
)
```
