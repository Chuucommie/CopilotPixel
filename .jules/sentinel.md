## 2026-10-16 - WebSocket External Asset Directory Handlers Missing Privilege Check
**Vulnerability:** Untokened/unprivileged WebSocket clients were able to send `addExternalAssetDirectory` and `removeExternalAssetDirectory` messages to alter `externalAssetDirectories` in server `config.json` and trigger server asset reloads.
**Learning:** When adding new WebSocket client message handlers in `clientMessageHandler.ts` that write persistent state or trigger filesystem re-scans, developers must explicitly check `ctx.privileged`.
**Prevention:** Enforce `if (!ctx.privileged)` authorization checks on all ClientMessage handlers that modify system or workspace configurations outside local webview scope.
