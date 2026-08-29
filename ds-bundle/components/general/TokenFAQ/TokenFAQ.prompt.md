TokenFAQ from vestr. Use via `window.Vestream.TokenFAQ` (bundle loaded from the root `_ds_bundle.js`).

## Props

```ts
interface TokenFAQProps {
/** Ordered FAQ list from buildTokenFAQ(). Rendered verbatim and also serialised into the JSON-LD block. */
  items: FAQItem[];
  /** Token-specific heading so the section matches the rest of the page. */
  symbol: string;
}
```

## Examples

### Default

```jsx
() => <TokenFAQ items={ITEMS} symbol="NOVA" />
```
