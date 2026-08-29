CopyableCode from vestr. Use via `window.Vestream.CopyableCode` (bundle loaded from the root `_ds_bundle.js`).

## Props

```ts
interface CopyableCodeProps {
code: string;
  /** Small uppercase eyebrow above the block (e.g. "claude_desktop_config.json"). */
  label?: string;
}
```

## Examples

### WithLabel

```jsx
() => (
  <Frame>
    <CopyableCode
      label="claude_desktop_config.json"
      code={`{
  "mcpServers": {
    "vestream": {
      "command": "npx",
      "args": ["-y", "@vestream/mcp"],
      "env": { "VESTREAM_API_KEY": "vstr_live_…" }
    }
  }
}`}
    />
  </Frame>
)
```

### SingleLine

```jsx
() => (
  <Frame>
    <CopyableCode label="Install" code="npm install @vestream/mcp" />
  </Frame>
)
```
