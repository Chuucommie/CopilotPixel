## 2026-10-16 - WebSocket Client Message Privilege Gate Pattern
**Vulnerability:** Unprivileged WebSocket connections could invoke `addExternalAssetDirectory` and `removeExternalAssetDirectory`, modifying user configuration (`config.json`) and triggering server-side scanning/loading of arbitrary filesystem paths.
**Learning:** In standalone mode, connection origin/token determines `ctx.privileged`. Any WebSocket client message that writes configuration outside `~/.pixel-office/` or triggers filesystem asset loading must explicitly check `ctx.privileged`.
**Prevention:** Always verify `if (!ctx.privileged)` on WebSocket handler cases that alter server configuration or initiate filesystem scanning.
