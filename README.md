# OneClickTrend

Turborepo monorepo: React Native app + TypeScript API.

## Structure

```
frontend/mobile   React Native app (TypeScript)
backend/api       Express API (TypeScript) — GET /hello
```

## Requirements

- Node 22 (`nvm use`), pnpm, CocoaPods, Xcode
- iPhone connected via USB (same Apple developer team as the dating app)

## Setup

```bash
make install
```

## Run

```bash
# Terminal 1 — API on :3000
make backend

# Terminal 2 — deploy to the connected iPhone (Release build, no Metro needed)
make iphone
```

The app shows a **hello world** button; tapping it calls `GET /hello` on the API
and prints the response. For a physical iPhone the Makefile rewrites
`frontend/mobile/src/config.ts` with the Mac's LAN IP — phone and Mac must be on
the same Wi-Fi.

Other targets: `make simulator`, `make iphone-debug` (+ `make metro`), `make clean`.
