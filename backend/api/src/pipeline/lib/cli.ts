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
