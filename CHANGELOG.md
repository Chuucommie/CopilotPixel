# Changelog

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
