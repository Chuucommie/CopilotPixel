# Sentinel's Security Journal

## 2025-05-18 - Untokened WebSocket Clients Can Modify External Asset Directories
**Vulnerability:** Standalone WebSocket clients without the authentication token could send `addExternalAssetDirectory` and `removeExternalAssetDirectory` messages, allowing untrusted/cross-network clients to inject arbitrary filesystem paths into `externalAssetDirectories` and trigger server-side directory scanning/asset loading (`loadAllCharacters`, `loadAllPets`, `loadAllFurniture`).
**Learning:** `ctx.privileged` was previously only enforced on `setHooksEnabled` and `hooksConsentResponse`. State-modifying operations or configuration changes that cause the server to read from arbitrary filesystem directories must also be gated by `ctx.privileged`.
**Prevention:** Guard all WebSocket actions that mutate global configuration or instruct the server to access local filesystem paths with `if (!ctx.privileged)` in `server/src/clientMessageHandler.ts`.
