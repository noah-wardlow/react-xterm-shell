export { useXTerm } from "./use-xterm";
export { XTerm } from "./xterm";
export type { XTermProps } from "./xterm";
export { TerminalProvider, useTerminalController } from "./context";
export type {
  UseXTermOptions,
  TerminalController,
  XTermHandle
} from "./types";

// Convenience re-export so consumers can type a theme without a direct
// @xterm/xterm import.
export type { ITheme, Terminal } from "@xterm/xterm";
