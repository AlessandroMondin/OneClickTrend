# OneClickTrend

Turborepo monorepo: React Native app + TypeScript API + Postgres + LocalStack (S3).

## Structure

```
frontend/mobile     React Native app (TypeScript) — Characters & Generations
backend/api         Express API (TypeScript) — characters, media, generations
packages/database   Prisma schema + client (@oneclicktrend/database)
```

## Requirements

- Node 22 (`nvm use`), pnpm, CocoaPods, Xcode, Docker Desktop
- iPhone connected via USB

## Setup

```bash
make install                       # pnpm install + pod install
cp backend/api/.env.example backend/api/.env
cp packages/database/.env.example packages/database/.env
make migrate                       # starts docker (postgres + localstack) + prisma migrate
```

## Run

```bash
# Terminal 1 — API on :3000 (also brings up docker)
make backend

# Terminal 2 — deploy to the connected iPhone (Release build, no Metro needed)
make iphone
```

`make configure-api` (run automatically by `make iphone`) rewrites the app's
`API_URL` and the API's `S3_PUBLIC_ENDPOINT` with the Mac's LAN IP — phone and
Mac must be on the same Wi-Fi.

## App

- **Characters** tab: list characters, "Add a Character" (photos + video from
  gallery or camera), tap a character to see its media.
- **My Generations** tab: user generations (empty for now).

Media flow: the app asks `POST /characters/:id/media` for presigned S3 PUT
URLs, uploads directly to LocalStack, and displays media through the API's
streaming `GET /media/:id` endpoint (Range supported for video).

## Animation pipeline

Tapping **Animate** on a shared link asks for a character, then the API runs
the TikTok → Viggle workflow from `scripts/`
(`pnpm --filter @oneclicktrend/scripts pipeline "<url>" --image <character photo>`),
uploads the rendered video to S3 and marks the Generation `completed` — it then
plays inline in My Generations. Requires real API keys:

```bash
cp scripts/.env.example scripts/.env   # fill APIFY_TOKEN and VIGGLE_API_KEY
```

Without keys the pipeline fails fast and the Generation shows `failed` with the
reason. Per-job logs: `logs/animate-<generationId>.log`.

## Other targets

`make simulator`, `make iphone-debug` (+ `make metro`), `make db-up`,
`make db-down`, `make clean`.
