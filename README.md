# react-xterm-shell

[Demo](https://react-xterm-shell-example.pages.dev) | [npm package](https://www.npmjs.com/package/react-xterm-shell) | [Example source](https://github.com/noah-wardlow/react-xterm-shell/tree/main/example)

> **Beta** — under active development; the API may change between minor versions until 1.0.

A small React shell around [xterm.js](https://xtermjs.org/). It is a **React shell around xterm, not a React renderer for terminal cells** — xterm owns the grid, parsing, and rendering; this gives you the lifecycle, a stable imperative controller, automatic fitting, and opt-in addons as ordinary React.

The demo is a Vite web page with theme switching, transport telemetry, web-links/unicode11 examples, and a mock backend filesystem users can mutate from the terminal.

- `useXTerm()` — creates and owns the xterm instance behind a stable controller.
- `<XTerm />` — the DOM mount point.
- `TerminalProvider` / `useTerminalController()` — drive the terminal from surrounding UI without prop drilling.
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
import { useEffect, useRef } from "react";
import { useXTerm, XTerm, type XTermHandle } from "react-xterm-shell";
import "@xterm/xterm/css/xterm.css";

export function TerminalPanel() {
  const terminalRef = useRef<XTermHandle | null>(null);
  const terminal = useXTerm({
    onData: (data) => terminalRef.current?.write(data === "\r" ? "\r\n$ " : data),
    theme: { background: "#1a1b26", foreground: "#a9b1d6" }
  });
  terminalRef.current = terminal;

  useEffect(() => {
    terminal.write("react-xterm-shell\r\n$ ");
    terminal.focus();
  }, [terminal]);

  return <XTerm terminal={terminal} style={{ width: "100%", height: 420 }} />;
}
```

## External controls

`useXTerm` returns a stable controller, so surrounding UI can drive it imperatively
without re-rendering as bytes stream:

```tsx
import { useXTerm, XTerm, TerminalProvider, useTerminalController } from "react-xterm-shell";

function SessionActions() {
  const term = useTerminalController();
  return (
    <div>
      <button onClick={() => term.write("deploy --target staging\r\n")}>Insert command</button>
      <button onClick={term.clear}>Clear</button>
      <button onClick={term.focus}>Focus</button>
    </div>
  );
}

function Panel() {
  const terminal = useXTerm({ onData: send });
  return (
    <TerminalProvider value={terminal}>
      <SessionActions />
      <XTerm terminal={terminal} className="h-[420px]" />
    </TerminalProvider>
  );
}
```

## Backend wiring

The package does not include a transport. Connect `onData` and `onResize` to a
PTY, SSH, container, or WebSocket service, and stream backend output into
`terminal.write()`:

```tsx
function RemoteShell({ socket }: { socket: WebSocket }) {
  const terminal = useXTerm({
    onData: (data) => socket.send(JSON.stringify({ type: "input", data })),
    onResize: ({ cols, rows }) =>
      socket.send(JSON.stringify({ type: "resize", cols, rows }))
  });

  socket.onmessage = (event) => terminal.write(event.data);

  // Re-send the size once the socket is open. The mount-time `onResize` fires
  // before the socket connects, so that first resize is dropped — without this
  // the PTY stays at its connect-time default and the shell renders narrower
  // than the pane.
  socket.onopen = () => {
    const size = terminal.getDimensions();
    if (size) socket.send(JSON.stringify({ type: "resize", ...size }));
  };

  return <XTerm terminal={terminal} className="h-[420px]" />;
}
```

> **Sizing gotcha:** the terminal fits at mount, so the first `onResize` fires
> *before* your transport is connected and that size is lost. Always re-send the
> size on (re)connect using `getDimensions()`, as shown above.

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
`term` getter, and `write` / `clear` / `reset` / `focus` / `fit` /
`getDimensions` (`clear` keeps the prompt line; `reset` blanks the screen and
drops scrollback; `getDimensions` returns the current `{ cols, rows }` or `null`
before attach — see the sizing gotcha under [Backend wiring](#backend-wiring)).
The handle is stable across renders; callbacks are read through refs, so passing
fresh `onData` / `onResize` each render does not remount the terminal.

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
