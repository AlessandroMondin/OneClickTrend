# OneClickTrend monorepo
#
# React Native requires node >= 22 — resolved from nvm below.

NODE_DIR := $(shell ls -d $(HOME)/.nvm/versions/node/v22*/bin 2>/dev/null | tail -1)
export PATH := $(NODE_DIR):$(PATH)

MOBILE := frontend/mobile
CONFIG := $(MOBILE)/src/config.ts

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
	echo "API_URL -> http://$$IP:3000"

## iphone: build a Release app and install it on the connected iPhone (no Metro needed)
iphone: configure-api
	cd $(MOBILE) && npx react-native run-ios --device --mode Release

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
