import { pathToFileURL } from "node:url";
import { errorMessage, fail } from "./log";

/** True when this module was the file passed to node/tsx, not merely imported. */
export function isMain(moduleUrl: string): boolean {
  const entry = process.argv[1];
  return entry ? moduleUrl === pathToFileURL(entry).href : false;
}

/**
 * Runs `body` only when the module is the CLI entrypoint, turning a thrown error
 * into a one-line message and a non-zero exit code instead of a stack trace.
 */
export async function runCli(moduleUrl: string, body: () => Promise<void>): Promise<void> {
  if (!isMain(moduleUrl)) return;
  try {
    await body();
  } catch (error) {
    console.error("");
    fail(errorMessage(error));
    process.exitCode = 1;
  }
}

export interface Args {
  positional: string[];
  flags: Map<string, string | true>;
}

/** Minimal argv parser: `--flag`, `--key value` and `--key=value`. */
export function parseArgs(argv: string[] = process.argv.slice(2)): Args {
  const positional: string[] = [];
  const flags = new Map<string, string | true>();

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]!;
    if (!token.startsWith("--")) {
      positional.push(token);
      continue;
    }
    const [key, inlineValue] = token.slice(2).split(/=(.*)/s, 2);
    if (!key) continue;
    if (inlineValue !== undefined) {
      flags.set(key, inlineValue);
      continue;
    }
    const next = argv[index + 1];
    if (next && !next.startsWith("--")) {
      flags.set(key, next);
      index += 1;
    } else {
      flags.set(key, true);
    }
  }

  return { positional, flags };
}

export function flagValue(args: Args, name: string): string | undefined {
  const value = args.flags.get(name);
  return typeof value === "string" ? value : undefined;
}

export function hasFlag(args: Args, name: string): boolean {
  return args.flags.has(name);
}
