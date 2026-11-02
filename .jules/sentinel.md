# Sentinel's Journal

## 2026-10-31 - Privilege Enforcement on External Asset Directory Modifications
**Vulnerability:** Untokened standalone WebSocket connections (`/ws`) could send `addExternalAssetDirectory` and `removeExternalAssetDirectory` messages, allowing unprivileged clients to mutate persistent server configuration on disk (`~/.pixel-office/config.json`) and trigger server-side asset loader side-effects without token authorization.
**Learning:** Connecting to `/ws` in standalone mode only required same-origin origin checks (`isAllowedWebSocketOrigin`), which permits any local or rebound web page to connect. Sensitive operations that alter persistent host settings or trigger file-system operations on custom paths must be explicitly guarded by `ctx.privileged` (which requires the out-of-band token).
**Prevention:** Always verify `ctx.privileged` on any incoming WebSocket client message handler that mutates persistent configuration or triggers server-side side-effects.
