# react-xterm-shell

> **Beta** — under active development; the API may change between minor versions until 1.0.

A small React shell around [xterm.js](https://xtermjs.org/). It is a **React shell around xterm, not a React renderer for terminal cells** — xterm owns the grid, parsing, and rendering; this gives you the lifecycle, a stable imperative controller, automatic fitting, and opt-in addons as ordinary React.

- `useXTerm()` — creates and owns the xterm instance behind a stable controller.
- `<XTerm />` — the DOM mount point.
- `TerminalProvider` / `useTerminalController()` — drive the terminal from chrome (toolbars) without prop drilling.
- Automatic sizing via `FitAddon` + `ResizeObserver`.
- Opt-in `webgl` (with DOM fallback), `web-links`, and `unicode11` addons, on by default.

It does **not** include a transport — wire `onData`/`onResize` to your own WebSocket/PTY backend. That keeps the wrapper reusable across rosbridge, a PTY service, SSH, or a local shell.

## Install

```bash
npm install react-xterm-shell @xterm/xterm react@^19
```

React 19 and `@xterm/xterm` are peer dependencies. Import the xterm stylesheet once in your app:

```ts
import "@xterm/xterm/css/xterm.css";
```

## Quick start

```tsx
import { useXTerm, XTerm } from "react-xterm-shell";
import "@xterm/xterm/css/xterm.css";

function TerminalPanel({ socket }: { socket: WebSocket }) {
  const terminal = useXTerm({
    onData: (data) => socket.send(JSON.stringify({ type: "input", data })),
    onResize: ({ cols, rows }) =>
      socket.send(JSON.stringify({ type: "resize", cols, rows })),
    theme: { background: "#1a1b26", foreground: "#a9b1d6" }
  });

  // Stream server output into the terminal:
  socket.onmessage = (e) => terminal.write(e.data);

  return <XTerm terminal={terminal} style={{ width: "100%", height: 420 }} />;
}
```

## Composition

`useXTerm` returns a stable controller, so a toolbar can drive it imperatively
without re-rendering as bytes stream:

```tsx
import { useXTerm, XTerm, TerminalProvider, useTerminalController } from "react-xterm-shell";

function Toolbar() {
  const term = useTerminalController();
  return <button onClick={term.clear}>Clear</button>;
}

function Panel() {
  const terminal = useXTerm({ onData: send });
  return (
    <TerminalProvider value={terminal}>
      <Toolbar />
      <XTerm terminal={terminal} className="h-[420px]" />
    </TerminalProvider>
  );
}
```

## API

### `useXTerm(options?) => XTermHandle`

| Option | Type | Default | Notes |
|--------|------|---------|-------|
| `onData` | `(data: string) => void` | — | User keystrokes (xterm `onData`). |
| `onResize` | `(size: { cols, rows }) => void` | — | Fires when the grid resizes. |
| `theme` | `ITheme` | — | xterm color theme. |
| `fontSize` | `number` | `13` | |
| `scrollback` | `number` | `1000` | |
| `cursorBlink` | `boolean` | `true` | |
| `webgl` | `boolean` | `true` | GL renderer; falls back to DOM on context loss. |
| `webLinks` | `boolean` | `true` | Clickable URLs. |
| `unicode11` | `boolean` | `true` | Correct width for box-drawing / emoji. |
| `options` | `ITerminalOptions` | — | Merged over the above. |
| `addons` | `ITerminalAddon[]` | — | Extra addons (e.g. a search addon). |

The returned `XTermHandle` has `attach` (the callback ref for `<XTerm>`), a live
`term` getter, and `write` / `clear` / `focus` / `fit`. The handle is stable
across renders; callbacks are read through refs, so passing fresh `onData` /
`onResize` each render does not remount the terminal.

### `<XTerm terminal={handle} className? style? />`

Renders the mount element. The `terminal.attach` callback ref is the whole
integration surface.

## Addon notes

`@xterm/addon-fit`, `-web-links`, `-unicode11`, and `-webgl` are bundled as
dependencies and pinned to the xterm-5 line. WebGL loads after `open()` and is
guarded: if the GL context is unavailable or lost, it disposes and the DOM
renderer takes over. Disable any of them via the `webgl` / `webLinks` /
`unicode11` options.

## License

MIT
