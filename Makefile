# OneClickTrend monorepo
#
# React Native requires node >= 22 — resolved from nvm below.

NODE_DIR := $(shell ls -d $(HOME)/.nvm/versions/node/v22*/bin 2>/dev/null | tail -1)
export PATH := $(NODE_DIR):$(PATH)

MOBILE := frontend/mobile
CONFIG := $(MOBILE)/src/config.ts
BUNDLE_ID := org.reactjs.native.example.OneClickTrend
DEVICE_ID := $(shell xcrun devicectl list devices 2>/dev/null | grep -oE '[0-9A-F]{8}-[0-9A-F-]{27}' | head -1)

.PHONY: install backend configure-api iphone iphone-debug simulator metro clean

## install: install JS deps (pnpm) and iOS pods
install:
	pnpm install
	cd $(MOBILE)/ios && pod install

## backend: run the API locally on :3000
backend:
	pnpm --filter @oneclicktrend/api dev

## configure-api: point the app at this Mac's LAN IP (needed for a physical iPhone)
configure-api:
	@IP=$$(ipconfig getifaddr en0); \
	if [ -z "$$IP" ]; then echo "No LAN IP found on en0 — is Wi-Fi on?"; exit 1; fi; \
	sed -i '' "s|http://[^\"]*|http://$$IP:3000|" $(CONFIG); \
	sed -i '' "s|^S3_PUBLIC_ENDPOINT=.*|S3_PUBLIC_ENDPOINT=http://$$IP:4566|" backend/api/.env; \
	echo "API_URL -> http://$$IP:3000  S3_PUBLIC_ENDPOINT -> http://$$IP:4566"

## db-up: start postgres + localstack (waits until healthy, bucket ready)
db-up:
	cd backend/api && docker compose up -d --wait

## db-down: stop postgres + localstack
db-down:
	cd backend/api && docker compose down

## migrate: run prisma migrations against the local db
migrate: db-up
	cd packages/database && npx prisma migrate dev

## iphone: build a Release app and install it on the connected iPhone (no Metro needed)
iphone: configure-api
	@if [ -z "$(DEVICE_ID)" ]; then echo "No iPhone found — plug it in and unlock it"; exit 1; fi
	cd $(MOBILE)/ios && xcodebuild -workspace OneClickTrend.xcworkspace -scheme OneClickTrend \
		-configuration Release -destination 'generic/platform=iOS' \
		-derivedDataPath build/DerivedData -allowProvisioningUpdates build
	xcrun devicectl device install app --device $(DEVICE_ID) \
		$(MOBILE)/ios/build/DerivedData/Build/Products/Release-iphoneos/OneClickTrend.app
	xcrun devicectl device process launch --device $(DEVICE_ID) $(BUNDLE_ID)

## iphone-debug: Debug build on the iPhone (needs Metro: run `make metro` in another terminal)
iphone-debug: configure-api
	cd $(MOBILE) && npx react-native run-ios --device

## simulator: run on the iOS simulator (API on localhost)
simulator:
	@sed -i '' "s|http://[^\"]*|http://localhost:3000|" $(CONFIG)
	cd $(MOBILE) && npx react-native run-ios

## metro: start the Metro bundler
metro:
	cd $(MOBILE) && npx react-native start

clean:
	pnpm clean
	rm -rf $(MOBILE)/ios/build
