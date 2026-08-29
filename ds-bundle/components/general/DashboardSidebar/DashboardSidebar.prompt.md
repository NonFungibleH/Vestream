DashboardSidebar from vestr. Use via `window.Vestream.DashboardSidebar` (bundle loaded from the root `_ds_bundle.js`).

## Props

```ts
interface DashboardSidebarProps {
  /** Kept for back-compat with callers that still pass it. The sidebar no longer branches on tier – the dashboard is Pro-only */
  tier?: string;
  isOpen: boolean;
  onClose: () => void;
}
```
