StreamCard from vestr. Use via `window.Vestream.StreamCard` (bundle loaded from the root `_ds_bundle.js`).

## Props

```ts
interface StreamCardProps {
  stream: VestingStream;
  showRecipient?: boolean;
}
```

## Examples

### Vesting

```jsx
() => <div style={{ maxWidth: 560 }}><StreamCard stream={NOVA_STREAM} /></div>
```

### PreCliffNothingClaimable

```jsx
() => (
  <div style={{ maxWidth: 560 }}><StreamCard stream={FLUX_STREAM} /></div>
)
```

### FullyVested

```jsx
() => <div style={{ maxWidth: 560 }}><StreamCard stream={VEST_STREAM} /></div>
```

### WithRecipient

```jsx
() => (
  <div style={{ maxWidth: 560 }}><StreamCard stream={NOVA_STREAM} showRecipient /></div>
)
```
