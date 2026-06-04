import type {
  ITheme,
  ITerminalOptions,
  ITerminalAddon,
  Terminal
} from "@xterm/xterm";

export interface UseXTermOptions {
  /** Called with user keystrokes (xterm `onData`). Wire this to your transport. */
  onData?: (data: string) => void;
  /** Called when the rendered grid resizes (xterm `onResize`). */
  onResize?: (size: { cols: number; rows: number }) => void;
  /** xterm color theme. */
  theme?: ITheme;
  /** Font size in px. Default 13. */
  fontSize?: number;
  /** Scrollback lines retained. Default 1000. */
  scrollback?: number;
  /** Whether the cursor blinks. Default true. */
  cursorBlink?: boolean;
  /**
   * Built-in addons, all enabled by default:
   * - `webgl`: GL renderer with automatic DOM-renderer fallback on context loss.
   * - `webLinks`: clickable URLs in output.
   * - `unicode11`: correct width for box-drawing, spinners, and emoji.
   */
  webgl?: boolean;
  webLinks?: boolean;
  unicode11?: boolean;
  /** Extra xterm options merged over the ones above. */
  options?: ITerminalOptions;
  /** Additional addons to load (e.g. a search addon). */
  addons?: ITerminalAddon[];
}

/**
 * Imperative controller for the terminal. Stable across renders, so passing it
 * around (or into a context) never re-renders consumers as output streams. `term`
 * is a live getter that returns the instance once attached, `null` before.
 */
export interface TerminalController {
  readonly term: Terminal | null;
  write: (data: string | Uint8Array) => void;
  /** Clear scrollback, keeping the current prompt line (xterm `clear`). */
  clear: () => void;
  /** Full reset to a blank screen, dropping scrollback (xterm `reset`). */
  reset: () => void;
  focus: () => void;
  fit: () => void;
}

export type XTermHandle = TerminalController & {
  /**
   * Callback ref for the mount element. Creates the terminal on mount and
   * returns the cleanup that disposes it (React 19 ref-cleanup).
   */
  attach: (el: HTMLDivElement | null) => (() => void) | undefined;
};
