import React from "react";
import { render } from "ink";
import { App } from "./ui";
import { setShellIfWindows } from "./tools/shell-utils";
import { checkForNpmUpdate, promptForPendingUpdate, type PackageInfo } from "./updateCheck";

const args = process.argv.slice(2);
const packageInfo = readPackageInfo();

if (args.includes("--version") || args.includes("-v")) {
  process.stdout.write(`${packageInfo.version || "unknown"}\n`);
  process.exit(0);
}

if (args.includes("--help") || args.includes("-h")) {
  process.stdout.write(
    [
      "deepcode - Deep Code CLI",
      "",
      "Usage:",
      "  deepcode                    Launch the interactive TUI in the current directory",
      "  deepcode -r                  Open the session picker to resume a conversation",
      "  deepcode -r <session-id>    Resume a specific session directly",
      "  deepcode --resume <id>      Same as -r",
      "  deepcode --version          Print the version",
      "  deepcode --help             Show this help",
      "",
      "Configuration:",
      "  ~/.deepcode/settings.json   API key, model, base URL",
      "  ~/.agents/skills/*/SKILL.md  User-level skills",
      "  ./.deepcode/skills/*/SKILL.md Project-level skills",
      "",
      "Inside the TUI:",
      "  enter            Send the prompt",
      "  shift+enter      Insert a newline",
      "  home/end         Move within the current line",
      "  alt+left/right   Move by word",
      "  ctrl+w           Delete the previous word",
      "  ctrl+v           Paste an image from the clipboard",
      "  ctrl+x           Clear pasted images",
      "  esc              Interrupt the current model turn",
      "  /                Open the skills/commands menu",
      "  /new             Start a fresh conversation",
      "  /resume          Pick a previous conversation to continue",
      "  /exit            Quit",
      "  ctrl+d twice     Quit"
    ].join("\n") + "\n"
  );
  process.exit(0);
}

function parseResumeArg(args: string[]): string | null {
  const rIndex = args.indexOf("-r");
  if (rIndex !== -1) {
    const next = args[rIndex + 1];
    if (next && !next.startsWith("-")) {
      return next;
    }
    return ""; // -r without session-id → show session list
  }
  const resumeIndex = args.indexOf("--resume");
  if (resumeIndex !== -1) {
    const next = args[resumeIndex + 1];
    if (next && !next.startsWith("-")) {
      return next;
    }
    return ""; // --resume without session-id → show session list
  }
  return null;
}

const projectRoot = process.cwd();
const initialSessionId = parseResumeArg(args);
configureWindowsShell();

if (!process.stdin.isTTY) {
  process.stderr.write(
    "deepcode requires an interactive terminal (TTY). " +
      "Re-run from a real terminal session.\n"
  );
  process.exit(1);
}

void main();

async function main(): Promise<void> {
  const updatePromptResult = await promptForPendingUpdate(packageInfo);

  const restartRef: { current: (() => void) | null } = { current: null };

  function startApp(): void {
    const inkInstance = render(
      <App
        projectRoot={projectRoot}
        version={packageInfo.version}
        initialSessionId={initialSessionId}
        onRestart={() => restartRef.current?.()}
      />,
      { exitOnCtrlC: false }
    );

    restartRef.current = () => {
      process.stdout.write("\u001B[2J\u001B[3J\u001B[H");
      inkInstance.unmount();
      startApp();
    };

    inkInstance.waitUntilExit().then(() => {
      if (!restartRef.current) {
        process.exit(0);
      }
    });
  }

  if (!updatePromptResult.installed) {
    void checkForNpmUpdate(packageInfo);
  }

  startApp();
}

function configureWindowsShell(): void {
  process.env.NoDefaultCurrentDirectoryInExePath = "1";
  try {
    setShellIfWindows();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`deepcode: ${message}\n`);
    process.exit(1);
  }
}

function readPackageInfo(): PackageInfo {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const pkg = require("../package.json") as { name?: unknown; version?: unknown };
    return {
      name: typeof pkg.name === "string" ? pkg.name : "@vegamo/deepcode-cli",
      version: typeof pkg.version === "string" ? pkg.version : ""
    };
  } catch {
    return { name: "@vegamo/deepcode-cli", version: "" };
  }
}
