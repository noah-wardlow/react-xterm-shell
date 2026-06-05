import { useCallback, useEffect, useMemo, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import { WebglAddon } from "@xterm/addon-webgl";

import type { UseXTermOptions, XTermHandle } from "./types";

const DEFAULT_FONT_SIZE = 13;
const DEFAULT_SCROLLBACK = 1000;

/**
 * A React shell around xterm.js. xterm owns the terminal grid and rendering;
 * this hook owns the instance lifecycle and exposes a stable imperative
 * controller so the surrounding tree can drive it without re-rendering as
 * output streams.
 *
 * The instance is created lazily in the `attach` callback ref and disposed by
 * the cleanup it returns. Sizing is automatic via a `ResizeObserver` + `FitAddon`.
 *
 * Import the stylesheet once in your app: `import "@xterm/xterm/css/xterm.css"`.
 */
export function useXTerm(opts: UseXTermOptions = {}): XTermHandle {
  const {
    onData,
    onResize,
    theme,
    fontSize,
    scrollback,
    cursorBlink,
    webgl = true,
    webLinks = true,
    unicode11 = true,
    options,
    addons
  } = opts;

  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  // Latest callbacks live in refs so `attach` does not depend on their identity.
  // Otherwise a parent passing fresh callbacks each render would change `attach`,
  // and the callback ref would dispose and recreate the terminal (wiping
  // scrollback). The xterm handlers read the refs, so no stale-closure risk.
  const onDataRef = useRef(onData);
  const onResizeRef = useRef(onResize);
  useEffect(() => {
    onDataRef.current = onData;
    onResizeRef.current = onResize;
  }, [onData, onResize]);

  // Snapshot the addon set + extra addons so identity churn does not remount.
  const extraAddons = useRef(addons);
  extraAddons.current = addons;

  const attach = useCallback(
    (el: HTMLDivElement | null) => {
      if (!el) {
        cleanupRef.current?.();
        cleanupRef.current = null;
        return;
      }
      if (termRef.current) return;

      const term = new Terminal({
        cursorBlink: cursorBlink ?? true,
        fontSize: fontSize ?? DEFAULT_FONT_SIZE,
        theme,
        scrollback: scrollback ?? DEFAULT_SCROLLBACK,
        allowProposedApi: true,
        ...options
      });

      const fit = new FitAddon();
      term.loadAddon(fit);

      if (webLinks) term.loadAddon(new WebLinksAddon());
      if (unicode11) {
        term.loadAddon(new Unicode11Addon());
        term.unicode.activeVersion = "11";
      }
      for (const addon of extraAddons.current ?? []) {
        term.loadAddon(addon);
      }

      term.open(el);

      // WebGL must load after open(); fall back to the DOM renderer if the GL
      // context is unavailable or lost.
      if (webgl) {
        try {
          const webglAddon = new WebglAddon();
          webglAddon.onContextLoss(() => webglAddon.dispose());
          term.loadAddon(webglAddon);
        } catch {
          // No WebGL (headless/software GL); the DOM renderer remains active.
        }
      }

      // Register handlers before the first fit() so the mount-time resize is
      // delivered to onResize. If fit() runs first, that initial resize event
      // fires with no listener attached and the starting grid size is lost —
      // leaving a transport that only syncs on onResize stuck at the default.
      const disposables = [
        term.onData((data) => onDataRef.current?.(data)),
        term.onResize((size) => onResizeRef.current?.(size))
      ];

      fit.fit();

      const resizeObserver = new ResizeObserver(() => fit.fit());
      resizeObserver.observe(el);

      termRef.current = term;
      fitRef.current = fit;

      cleanupRef.current = () => {
        resizeObserver.disconnect();
        disposables.forEach((d) => d.dispose());
        term.dispose();
        termRef.current = null;
        fitRef.current = null;
      };
    },
    [theme, fontSize, scrollback, cursorBlink, webgl, webLinks, unicode11, options]
  );

  // One stable handle. `term` is a live getter — spreading it into a static
  // object would freeze it to the null it holds before attach. Methods read the
  // refs, so the handle is stable while the instance comes and goes.
  return useMemo<XTermHandle>(
    () => ({
      get term() {
        return termRef.current;
      },
      write: (data) => termRef.current?.write(data),
      clear: () => termRef.current?.clear(),
      reset: () => termRef.current?.reset(),
      focus: () => termRef.current?.focus(),
      fit: () => fitRef.current?.fit(),
      getDimensions: () => {
        const term = termRef.current;
        return term ? { cols: term.cols, rows: term.rows } : null;
      },
      attach
    }),
    [attach]
  );
}
