UnlockSummary from vestr. Use via `window.Vestream.UnlockSummary` (bundle loaded from the root `_ds_bundle.js`).

## Props

```ts
interface UnlockSummaryProps {
  streams: VestingStream[];
}
```

## Examples

### Portfolio

```jsx
() => <UnlockSummary streams={STREAMS} />
```

### SingleStream

```jsx
() => <UnlockSummary streams={[STREAMS[0]]} />
```
