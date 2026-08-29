VestingTimeline from vestr. Use via `window.Vestream.VestingTimeline` (bundle loaded from the root `_ds_bundle.js`).

## Props

```ts
interface VestingTimelineProps {
  streams: VestingStream[];
  showRecipient?: boolean;
}
```

## Examples

### Portfolio

```jsx
() => <VestingTimeline streams={STREAMS} />
```

### WithRecipients

```jsx
() => <VestingTimeline streams={STREAMS} showRecipient />
```

### SingleStream

```jsx
() => <VestingTimeline streams={[STREAMS[0]]} />
```
