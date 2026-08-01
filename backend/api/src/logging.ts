import fs from "fs";
import path from "path";

import type express from "express";

const LOG_DIR = path.resolve(__dirname, "../../../logs");
fs.mkdirSync(LOG_DIR, { recursive: true });

function append(file: string, line: string) {
  fs.appendFile(
    path.join(LOG_DIR, file),
    `${new Date().toISOString()} ${line}\n`,
    () => {},
  );
}

export function apiLog(line: string) {
  append("api.log", line);
}

export function appLog(line: string) {
  append("app.log", line);
}

// Logs every request with status + duration to logs/api.log.
export function requestLogger(): express.RequestHandler {
  return (req, res, next) => {
    const start = Date.now();
    res.on("finish", () => {
      apiLog(`${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - start}ms`);
    });
    next();
  };
}
