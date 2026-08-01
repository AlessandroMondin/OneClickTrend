import { API_URL } from "./config";

// Local-dev remote logging: mirrors console output and fatal JS errors to the
// API (logs/app.log on the Mac) so they are inspectable without Xcode.

function send(level: string, args: unknown[]) {
  const message = args
    .map((a) => {
      if (typeof a === "string") {
        return a;
      }
      try {
        return JSON.stringify(a);
      } catch {
        return String(a);
      }
    })
    .join(" ");
  fetch(`${API_URL}/logs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ level, message }),
  }).catch(() => {});
}

export function initRemoteLogging() {
  for (const level of ["log", "warn", "error"] as const) {
    const original = console[level].bind(console);
    console[level] = (...args: unknown[]) => {
      original(...args);
      send(level, args);
    };
  }

  const ErrorUtils = (globalThis as any).ErrorUtils;
  if (ErrorUtils?.setGlobalHandler) {
    const prev = ErrorUtils.getGlobalHandler?.();
    ErrorUtils.setGlobalHandler((error: unknown, isFatal?: boolean) => {
      send("fatal", [
        `isFatal=${isFatal}`,
        error instanceof Error ? `${error.message}\n${error.stack}` : error,
      ]);
      prev?.(error, isFatal);
    });
  }
}
