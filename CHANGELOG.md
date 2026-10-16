# Changelog

## v1.4.3

### GitHub Copilot Chat Integration

- Added native support for VS Code GitHub Copilot Chat sidebar and editor sessions (`workspaceStorage/<workspace-hash>/chatSessions/`).
- Implemented parser for VS Code Chat streaming mutations (`kind: 0` snapshots, `kind: 1` prompt starts, `kind: 2` tool execution & result completion).
- Automatic discovery of workspace chat directories across Linux, macOS, and Windows for VS Code, VS Code Insiders, VSCodium, and Antigravity IDE.
- Extended tool status formatting for Copilot Chat tools (`editFiles`, `readFile`, `runCommand`, `findFiles`, `searchCode`, `fetchWeb`, `searchWeb`, `runSubagent`).
- Enabled click-to-focus on Copilot agents to directly open the Copilot Chat interface (`workbench.action.chat.open`).

## v1.4.2

### Marketplace & Compliance Finalization

- Finalized repository naming, metadata, and binary packaging for CopilotPixel on the Visual Studio Marketplace.
- Full MIT License compliance with dual copyright header (Chuucommie & upstream contributors) and comprehensive ATTRIBUTIONS.md.
- Trademark safety: renamed pet from `gitcat` to `pixelcat` across all assets, schemas, manifests, and tests.
- Replaced binary branding assets (icon and webview banner) with unique Copilot-themed palettes and unique SHA-256 hashes.
- Configured clean `.vscodeignore` and package contracts ensuring zero source maps and zero uncompiled development files ship in the VSIX bundle.

## v1.4.1

### Copilot integration

- GitHub Copilot CLI is the active hook provider for the VS Code extension and standalone server.
- Hook installation is consent-gated and uses the Copilot CLI hook configuration.
- The standalone server provides a token-protected browser workspace.

### Packaging

- Rebranded the extension and npm package as CopilotAgents.
- Added a project README and aligned release metadata with the current repository.
