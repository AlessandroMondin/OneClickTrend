# OneClickTrend

Turbo monorepo: `frontend/mobile` (React Native 0.86, TS), `backend/api`
(Express + Prisma), `packages/database` (Prisma schema/client), Postgres +
LocalStack S3 via docker compose (`backend/api/docker-compose.yml`).

## Node

Node 22 required (RN 0.86). Not the system default — use
`export PATH="$HOME/.nvm/versions/node/v22*/bin:$PATH"`. The Makefile does this
itself.

## Logs (local dev — read these when debugging)

- `logs/api.log` — every API request (method/path/status/duration) + route errors with stacks.
- `logs/app.log` — the phone's `console.log/warn/error` and fatal JS errors,
  shipped from the device via `POST /logs` (see `frontend/mobile/src/log.ts`).
- `docker logs oneclicktrend-postgres` / `oneclicktrend-localstack`.

## Workflow

- `make backend` — docker up + API on :3000 (LAN-bound).
- `make iphone` — Release build → install+launch on the plugged-in iPhone via
  xcodebuild `-allowProvisioningUpdates` + devicectl (react-native run-ios
  cannot create provisioning profiles). Runs `configure-api` first, which
  rewrites the app's `API_URL` and the API's `S3_PUBLIC_ENDPOINT` with the
  Mac's LAN IP.
- `make migrate` — prisma migrate dev (docker up first).
- Uploads: app asks API for presigned S3 PUT URLs (signed against
  `S3_PUBLIC_ENDPOINT` so the phone can reach LocalStack over LAN), media
  display streams through API `GET /media/:id` (Range passthrough for video).

## Gotchas

- Express 4: every async route must go through `wrap()` in
  `backend/api/src/index.ts` — unhandled rejections kill the process.
- pnpm 10 needs `onlyBuiltDependencies` (root package.json) or prisma engines
  silently never download.
- tsx/turbo don't load .env: API uses `import "dotenv/config"`; prisma CLI
  reads `packages/database/.env` itself.
- After `configure-api` changes `backend/api/.env`, restart the API (tsx watch
  only watches src/).
