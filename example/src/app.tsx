import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TerminalProvider, useXTerm, XTerm } from "react-xterm-shell";

type FileNode = {
  type: "file";
  content: string;
};

type DirNode = {
  type: "dir";
  children: Record<string, FsNode>;
};

type FsNode = FileNode | DirNode;

type ShellResult = {
  cwd?: string[];
  fs?: DirNode;
  output?: string;
  clear?: boolean;
  resetTerminal?: boolean;
};

type ThemeKey = "default" | "solarized" | "monokai" | "light";

const initialFs: DirNode = {
  type: "dir",
  children: {
    home: {
      type: "dir",
      children: {
        guest: {
          type: "dir",
          children: {
            "README.md": {
              type: "file",
              content:
                "# Mock backend\n\nThis filesystem lives behind the terminal transport.\nTry: ls, cat README.md, mkdir logs, write logs/run.txt hello"
            },
            projects: {
              type: "dir",
              children: {
                "deploy.sh": {
                  type: "file",
                  content:
                    "echo building react-xterm-shell\npnpm run typecheck\npnpm run build"
                },
                "notes.txt": {
                  type: "file",
                  content: "Resize events, input bytes, and output bytes are all visible from React."
                }
              }
            }
          }
        }
      }
    },
    var: {
      type: "dir",
      children: {
        log: {
          type: "dir",
          children: {
            "backend.log": {
              type: "file",
              content: "mockfs: mounted\npty: connected\nresize: waiting for terminal"
            }
          }
        }
      }
    }
  }
};

const initialCwd = ["home", "guest"];
const promptColor = "\x1b[32m";
const pathColor = "\x1b[34m";
const resetColor = "\x1b[0m";

const themes: Record<ThemeKey, { label: string; xterm: Record<string, string> }> = {
  default: {
    label: "Default",
    xterm: {
      background: "#171717",
      foreground: "#f3f0e8",
      cursor: "#c678dd",
      selectionBackground: "#454545",
      black: "#171717",
      blue: "#80aaff",
      cyan: "#56d4dd",
      green: "#00d787",
      magenta: "#c678dd",
      red: "#ff6b6b",
      white: "#f3f0e8",
      yellow: "#f2c94c"
    }
  },
  solarized: {
    label: "Solarized",
    xterm: {
      background: "#002b36",
      foreground: "#eee8d5",
      cursor: "#2aa198",
      selectionBackground: "#073642",
      black: "#073642",
      blue: "#268bd2",
      cyan: "#2aa198",
      green: "#859900",
      magenta: "#d33682",
      red: "#dc322f",
      white: "#fdf6e3",
      yellow: "#b58900"
    }
  },
  monokai: {
    label: "Monokai",
    xterm: {
      background: "#272822",
      foreground: "#f8f8f2",
      cursor: "#ae81ff",
      selectionBackground: "#49483e",
      black: "#272822",
      blue: "#66d9ef",
      cyan: "#a1efe4",
      green: "#a6e22e",
      magenta: "#ae81ff",
      red: "#f92672",
      white: "#f8f8f2",
      yellow: "#e6db74"
    }
  },
  light: {
    label: "Light",
    xterm: {
      background: "#fbf7ef",
      foreground: "#1f2924",
      cursor: "#7c3aed",
      selectionBackground: "#d9e8dc",
      black: "#1f2924",
      blue: "#315fbd",
      cyan: "#007c89",
      green: "#277a3f",
      magenta: "#8b4ab8",
      red: "#ba3b46",
      white: "#fffaf2",
      yellow: "#8a6500"
    }
  }
};

function cloneFs(root: DirNode): DirNode {
  return JSON.parse(JSON.stringify(root)) as DirNode;
}

function normalizePath(cwd: string[], input?: string): string[] {
  const base = input?.startsWith("/") ? [] : [...cwd];
  for (const part of (input ?? "").split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") base.pop();
    else base.push(part);
  }
  return base;
}

function formatPath(path: string[]): string {
  return `/${path.join("/")}`;
}

function getNode(root: DirNode, path: string[]): FsNode | undefined {
  let node: FsNode = root;
  for (const part of path) {
    if (node.type !== "dir") return undefined;
    const next: FsNode | undefined = node.children[part];
    if (!next) return undefined;
    node = next;
  }
  return node;
}

function getParent(root: DirNode, path: string[]): { dir: DirNode; name: string } | undefined {
  const name = path.at(-1);
  if (!name) return undefined;
  const parent = getNode(root, path.slice(0, -1));
  if (!parent || parent.type !== "dir") return undefined;
  return { dir: parent, name };
}

function parseCommand(input: string): string[] {
  const args: string[] = [];
  let current = "";
  let quote: '"' | "'" | null = null;

  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (!char) continue;
    if (quote) {
      if (char === quote) quote = null;
      else current += char;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (/\s/.test(char)) {
      if (current) {
        args.push(current);
        current = "";
      }
      continue;
    }
    current += char;
  }

  if (current) args.push(current);
  return args;
}

function listDir(node: DirNode): string {
  const entries = Object.entries(node.children)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, child]) => child.type === "dir" ? `${name}/` : name);
  return entries.length ? `${entries.join("  ")}\r\n` : "";
}

function renderTree(node: FsNode, name: string, depth = 0): string {
  const prefix = "  ".repeat(depth);
  if (node.type === "file") return `${prefix}${name}\r\n`;
  const header = depth === 0 ? `${name}\r\n` : `${prefix}${name}/\r\n`;
  const children = Object.entries(node.children)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([childName, child]) => renderTree(child, childName, depth + 1))
    .join("");
  return header + children;
}

function executeShell(input: string, cwd: string[], fs: DirNode): ShellResult {
  const args = parseCommand(input.trim());
  const [command, ...rest] = args;
  if (!command) return {};

  if (command === "help") {
    return {
      output:
        "Commands: help, pwd, ls [path], cd <path>, cat <file>, tree [path], touch <file>, mkdir <dir>, write <file> <text>, append <file> <text>, rm <path>, links, unicode, clear, reset\r\n"
    };
  }

  if (command === "pwd") return { output: `${formatPath(cwd)}\r\n` };

  if (command === "ls") {
    const target = getNode(fs, normalizePath(cwd, rest[0]));
    if (!target) return { output: `ls: ${rest[0] ?? "."}: no such file or directory\r\n` };
    if (target.type === "file") return { output: `${rest[0] ?? ""}\r\n` };
    return { output: listDir(target) };
  }

  if (command === "cd") {
    const next = normalizePath(cwd, rest[0] ?? "/home/guest");
    const target = getNode(fs, next);
    if (!target || target.type !== "dir") return { output: `cd: ${rest[0] ?? ""}: not a directory\r\n` };
    return { cwd: next };
  }

  if (command === "cat") {
    const file = rest[0];
    if (!file) return { output: "cat: missing file\r\n" };
    const target = getNode(fs, normalizePath(cwd, file));
    if (!target) return { output: `cat: ${file}: no such file\r\n` };
    if (target.type !== "file") return { output: `cat: ${file}: is a directory\r\n` };
    return { output: `${target.content.replace(/\n/g, "\r\n")}\r\n` };
  }

  if (command === "tree") {
    const path = normalizePath(cwd, rest[0]);
    const target = getNode(fs, path);
    if (!target) return { output: `tree: ${rest[0] ?? "."}: no such file or directory\r\n` };
    return { output: renderTree(target, rest[0] ?? formatPath(path)) };
  }

  if (command === "touch" || command === "mkdir" || command === "write" || command === "append" || command === "rm") {
    const targetPath = rest[0];
    if (!targetPath) return { output: `${command}: missing path\r\n` };
    const nextFs = cloneFs(fs);
    const path = normalizePath(cwd, targetPath);

    if (command === "rm") {
      const parent = getParent(nextFs, path);
      if (!parent?.dir.children[parent.name]) return { output: `rm: ${targetPath}: no such file or directory\r\n` };
      delete parent.dir.children[parent.name];
      return { fs: nextFs };
    }

    const parent = getParent(nextFs, path);
    if (!parent) return { output: `${command}: cannot write at ${targetPath}\r\n` };

    if (command === "mkdir") {
      if (parent.dir.children[parent.name]) return { output: `mkdir: ${targetPath}: already exists\r\n` };
      parent.dir.children[parent.name] = { type: "dir", children: {} };
      return { fs: nextFs };
    }

    if (command === "touch") {
      parent.dir.children[parent.name] ??= { type: "file", content: "" };
      return { fs: nextFs };
    }

    const text = rest.slice(1).join(" ");
    const existing = parent.dir.children[parent.name];
    if (existing && existing.type === "dir") return { output: `${command}: ${targetPath}: is a directory\r\n` };
    const previous = existing?.type === "file" ? existing.content : "";
    parent.dir.children[parent.name] = {
      type: "file",
      content: command === "append" ? `${previous}${previous ? "\n" : ""}${text}` : text
    };
    return { fs: nextFs };
  }

  if (command === "clear") return { clear: true };
  if (command === "reset") return { fs: cloneFs(initialFs), cwd: initialCwd, resetTerminal: true };

  if (command === "whoami") return { output: "guest\r\n" };
  if (command === "links") {
    return {
      output:
        "web-links addon demo\r\nOpen: https://github.com/noah-wardlow/react-xterm-shell\r\nDocs: https://xtermjs.org/docs/\r\n"
    };
  }
  if (command === "unicode") {
    return {
      output:
        "unicode11 addon demo\r\nBox drawing: ┌──────────────┐\r\n             │  width: ok   │\r\n             └──────────────┘\r\nWide text:   コンテナ  シェル  端末\r\nSymbols:     ✓ λ → ∑ ⚙\r\n"
    };
  }

  return { output: `${command}: command not found. Try help.\r\n` };
}

function backendPrompt(cwd: string[]): string {
  return `${promptColor}guest@mockfs${resetColor}:${pathColor}${formatPath(cwd)}${resetColor}$ `;
}

function visiblePath(path: string[]): string {
  return path.length ? `/${path.join("/")}` : "/";
}

function countFiles(node: FsNode): { files: number; dirs: number } {
  if (node.type === "file") return { files: 1, dirs: 0 };
  return Object.values(node.children).reduce(
    (acc, child) => {
      const next = countFiles(child);
      return { files: acc.files + next.files, dirs: acc.dirs + next.dirs };
    },
    { files: 0, dirs: 1 }
  );
}

function FilesystemTree({
  node,
  path,
  onCommand
}: {
  node: DirNode;
  path: string[];
  onCommand: (command: string) => void;
}) {
  return (
    <ol className="fs-tree">
      {Object.entries(node.children)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([name, child]) => {
          const childPath = [...path, name];
          const shellPath = visiblePath(childPath);
          return (
            <li key={shellPath}>
              <button
                className={child.type === "dir" ? "fs-node fs-dir" : "fs-node fs-file"}
                onClick={() => onCommand(child.type === "dir" ? `ls ${shellPath}` : `cat ${shellPath}`)}
              >
                <span className="fs-kind">{child.type === "dir" ? "dir" : "file"}</span>
                <span>{name}</span>
              </button>
              {child.type === "dir" && <FilesystemTree node={child} path={childPath} onCommand={onCommand} />}
            </li>
          );
        })}
    </ol>
  );
}

export function App() {
  const [fs, setFs] = useState<DirNode>(() => cloneFs(initialFs));
  const [cwd, setCwd] = useState<string[]>(initialCwd);
  const [status, setStatus] = useState("connected");
  const [lastResize, setLastResize] = useState("pending");
  const [lastCommand, setLastCommand] = useState("help");
  const [latency, setLatency] = useState(18);
  const [selectedTheme, setSelectedTheme] = useState<ThemeKey>("default");
  const fsRef = useRef(fs);
  const cwdRef = useRef(cwd);
  const inputRef = useRef("");
  const historyRef = useRef<string[]>([]);
  const historyIndexRef = useRef<number | null>(null);
  const acceptingInputRef = useRef(true);
  const bootedTermRef = useRef<unknown>(null);

  useEffect(() => {
    fsRef.current = fs;
  }, [fs]);

  useEffect(() => {
    cwdRef.current = cwd;
  }, [cwd]);

  const terminalTheme = useMemo(() => themes.default.xterm, []);

  const terminalOptions = useMemo(
    () => ({
      convertEol: true,
      cursorStyle: "bar" as const,
      fontFamily: '"JetBrains Mono", "SFMono-Regular", Consolas, monospace'
    }),
    []
  );

  const terminal = useXTerm({
    fontSize: 14,
    scrollback: 2000,
    theme: terminalTheme,
    onResize: ({ cols, rows }) => {
      setLastResize(`${cols} x ${rows}`);
    },
    onData: (data) => {
      handleInput(data);
    },
    options: terminalOptions
  });

  useEffect(() => {
    if (terminal.term) terminal.term.options.theme = themes[selectedTheme].xterm;
  }, [selectedTheme, terminal]);

  const writePrompt = useCallback(() => {
    terminal.write(backendPrompt(cwdRef.current));
    acceptingInputRef.current = true;
  }, [terminal]);

  const applyResult = useCallback((result: ShellResult) => {
    if (result.resetTerminal) terminal.reset();
    if (result.clear) terminal.clear();
    if (result.fs) {
      fsRef.current = result.fs;
      setFs(result.fs);
    }
    if (result.cwd) {
      cwdRef.current = result.cwd;
      setCwd(result.cwd);
    }
    if (result.output) terminal.write(result.output);
    writePrompt();
  }, [terminal, writePrompt]);

  const submitCommand = useCallback((raw: string) => {
    const command = raw.trim();
    inputRef.current = "";
    historyIndexRef.current = null;
    acceptingInputRef.current = false;
    setLastCommand(command || "(empty)");
    if (command) historyRef.current = [...historyRef.current, command].slice(-50);
    setStatus("round trip");

    const delay = 80 + Math.floor(Math.random() * 90);
    setLatency(delay);
    window.setTimeout(() => {
      const result = executeShell(command, cwdRef.current, fsRef.current);
      applyResult(result);
      setStatus("connected");
    }, delay);
  }, [applyResult]);

  const replaceInput = useCallback((next: string) => {
    terminal.write("\r\x1b[2K");
    terminal.write(backendPrompt(cwdRef.current));
    inputRef.current = next;
    terminal.write(next);
  }, [terminal]);

  function handleInput(data: string) {
    if (!acceptingInputRef.current) return;

    for (const char of data) {
      if (char === "\r") {
        terminal.write("\r\n");
        submitCommand(inputRef.current);
        continue;
      }
      if (char === "\u0003") {
        terminal.write("^C\r\n");
        inputRef.current = "";
        writePrompt();
        continue;
      }
      if (char === "\u007f") {
        if (inputRef.current.length > 0) {
          inputRef.current = inputRef.current.slice(0, -1);
          terminal.write("\b \b");
        }
        continue;
      }
      if (char === "\u001b") continue;
      if (char >= " ") {
        inputRef.current += char;
        terminal.write(char);
      }
    }
  }

  const runCommand = useCallback((command: string) => {
    if (!acceptingInputRef.current) return;
    replaceInput(command);
    terminal.write("\r\n");
    submitCommand(command);
  }, [replaceInput, submitCommand, terminal]);

  useEffect(() => {
    const boot = () => {
      if (!terminal.term || bootedTermRef.current === terminal.term) return false;
      bootedTermRef.current = terminal.term;
      terminal.write("\x1b[1mreact-xterm-shell mock backend\x1b[0m\r\n");
      terminal.write("Try: ls, cat README.md, links, unicode\r\n\r\n");
      writePrompt();
      terminal.focus();
      return true;
    };
    if (boot()) return;
    const timer = window.setInterval(() => {
      if (boot()) window.clearInterval(timer);
    }, 50);
    return () => window.clearInterval(timer);
  }, [terminal, writePrompt]);

  const counts = useMemo(() => countFiles(fs), [fs]);

  return (
    <TerminalProvider value={terminal}>
      <main className={`shell-demo theme-${selectedTheme}`}>
        <nav className="topbar">
          <a className="brand" href="https://github.com/noah-wardlow/react-xterm-shell">
            react-xterm-shell
          </a>
          <div className="nav-links">
            <a href="https://www.npmjs.com/package/react-xterm-shell">npm</a>
            <a href="https://github.com/noah-wardlow/react-xterm-shell">GitHub</a>
            <button onClick={() => runCommand("help")}>help</button>
          </div>
        </nav>

        <section className="hero">
          <div className="hero-copy">
            <p className="eyebrow">React wrapper for xterm.js</p>
            <h1>Bring a real terminal into your React app.</h1>
            <p>
              Own the xterm lifecycle in React, keep an imperative controller for surrounding UI, and
              wire input/output to any PTY, WebSocket, SSH, container, or local mock service.
            </p>
          </div>

          <div className="session-card">
            <div className="theme-tabs" aria-label="Terminal theme">
              {(Object.keys(themes) as ThemeKey[]).map((key) => (
                <button
                  key={key}
                  className={selectedTheme === key ? "active" : ""}
                  onClick={() => setSelectedTheme(key)}
                >
                  {themes[key].label}
                </button>
              ))}
            </div>

            <div className="terminal-window">
              <div className="terminal-titlebar">
                <span>mockfs session</span>
                <div className="window-actions">
                  <button onClick={() => terminal.fit()} title="Fit terminal">fit</button>
                  <button onClick={() => terminal.clear()} title="Clear scrollback">clear</button>
                </div>
              </div>
              <XTerm terminal={terminal} className="terminal-surface" />
            </div>

            <div className="command-row">
              <button onClick={() => runCommand("ls")}>ls</button>
              <button onClick={() => runCommand("cat README.md")}>cat README.md</button>
              <button onClick={() => runCommand("tree /home/guest")}>tree</button>
              <button onClick={() => runCommand("links")}>web-links</button>
              <button onClick={() => runCommand("unicode")}>unicode11</button>
            </div>
          </div>
        </section>

        <section className="telemetry" aria-label="Mock backend telemetry">
          <div>
            <span>Status</span>
            <strong>{status}</strong>
          </div>
          <div>
            <span>Resize</span>
            <strong>{lastResize}</strong>
          </div>
          <div>
            <span>Latency</span>
            <strong>{latency} ms</strong>
          </div>
          <div>
            <span>CWD</span>
            <strong>{formatPath(cwd)}</strong>
          </div>
          <div>
            <span>Mock FS</span>
            <strong>{counts.files} files / {counts.dirs} dirs</strong>
          </div>
          <div>
            <span>Last command</span>
            <strong>{lastCommand}</strong>
          </div>
        </section>

        <section className="features">
          <article>
            <h2>Stable controller</h2>
            <p>`write`, `clear`, `reset`, `focus`, `fit`, and `getDimensions` stay stable across renders.</p>
          </article>
          <article>
            <h2>Transport agnostic</h2>
            <p>Use the same terminal with WebSockets, PTYs, SSH, containers, rosbridge, or local mocks.</p>
          </article>
          <article>
            <h2>Resize aware</h2>
            <p>FitAddon and ResizeObserver keep the terminal sized to its pane and expose PTY dimensions.</p>
          </article>
          <article>
            <h2>Addon ready</h2>
            <p>WebGL, web links, unicode11, and custom xterm addons are ordinary React hook options.</p>
          </article>
        </section>
      </main>
    </TerminalProvider>
  );
}
