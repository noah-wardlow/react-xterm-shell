import { createContext, useContext } from "react";
import type { ReactNode } from "react";

import type { TerminalController } from "./types";

const TerminalContext = createContext<TerminalController | null>(null);

/**
 * Provides a terminal controller to descendants so chrome (toolbars, buttons)
 * can drive the terminal imperatively without prop drilling.
 */
export function TerminalProvider({
  value,
  children
}: Readonly<{ value: TerminalController; children: ReactNode }>) {
  return (
    <TerminalContext.Provider value={value}>{children}</TerminalContext.Provider>
  );
}

/** Read the terminal controller from the nearest `TerminalProvider`. */
export function useTerminalController(): TerminalController {
  const ctx = useContext(TerminalContext);
  if (!ctx) {
    throw new Error("useTerminalController must be used within a <TerminalProvider>");
  }
  return ctx;
}
