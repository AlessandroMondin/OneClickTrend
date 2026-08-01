const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";
const RESET = "\x1b[0m";

export function step(message: string): void {
  console.log(`\n${BOLD}▸ ${message}${RESET}`);
}

export function info(message: string): void {
  console.log(`  ${message}`);
}

export function detail(message: string): void {
  console.log(`  ${DIM}${message}${RESET}`);
}

export function ok(message: string): void {
  console.log(`  ${GREEN}✓${RESET} ${message}`);
}

export function warn(message: string): void {
  console.log(`  ${YELLOW}!${RESET} ${message}`);
}

export function fail(message: string): void {
  console.error(`  ${RED}✗${RESET} ${message}`);
}

/** Starts a stopwatch; call the returned function for elapsed milliseconds. */
export function timer(): () => number {
  const start = Date.now();
  return () => Date.now() - start;
}

export function formatMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60_000);
  return `${minutes}m ${Math.round((ms % 60_000) / 1000)}s`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
