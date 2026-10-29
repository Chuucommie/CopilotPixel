## 2026-10-16 - External Asset Directory Privilege Gate Omission
**Vulnerability:** Untokened (unprivileged) WebSocket connections could send `addExternalAssetDirectory` or `removeExternalAssetDirectory` messages to alter `externalAssetDirectories` in `~/.pixel-office/config.json` and trigger local filesystem scans.
**Learning:** When adding new client message handlers to `handleClientMessage` in `clientMessageHandler.ts`, any message handler that mutates host configuration or causes reading/scanning of filesystem paths outside `~/.pixel-office/` must explicitly verify `ctx.privileged`.
**Prevention:** Always verify `if (!ctx.privileged) break;` for any new WebSocket message types that touch host system configuration or filesystem resources.
