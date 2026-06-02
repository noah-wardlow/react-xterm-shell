import type { XTermHandle } from "./types";

export interface XTermProps {
  /** The handle returned by `useXTerm`. */
  terminal: XTermHandle;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Thin DOM mount point for an xterm instance. The `useXTerm` callback ref is the
 * entire integration surface; this component just renders the host element.
 */
export function XTerm({ terminal, className, style }: Readonly<XTermProps>) {
  return <div ref={terminal.attach} className={className} style={style} />;
}
