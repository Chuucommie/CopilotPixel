# CopilotPixel

CopilotPixel is a VS Code extension and local browser workspace for monitoring GitHub Copilot CLI sessions. It visualizes session activity, tool use, permissions, and delegated work in a pixel-art office.

## Requirements

- VS Code 1.105 or later
- Node.js 20 or later for development and standalone use
- GitHub Copilot CLI for session tracking

## Install

Install **CopilotPixel** from the Visual Studio Marketplace using extension ID `chuucommie.copilot-pixe`. Hook installation is consent-gated and can be managed from the extension settings.

The standalone server is available as the `copilot-pixe` npm package:

```sh
npx copilot-pixe
```

The server prints a local URL for the browser workspace. Hook installation requires approval in that workspace.

## Development

```sh
npm install
npm run build
npm test
```

The repository contains a shared runtime, a VS Code adapter, a standalone Fastify server, and a React webview. The wire contract is defined in `core/asyncapi.yaml` and generated into `core/src/messages.ts`.

## License

MIT. See [LICENSE](LICENSE).

Project: [Chuucommie/CopilotPixel](https://github.com/Chuucommie/CopilotPixel).
