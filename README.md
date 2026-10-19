# Pixel Office - Virtual Office for AI Agents

**Pixel Office** is an interactive, retro pixel art virtual office for Visual Studio Code and Google Antigravity that brings your AI coding sessions to life. It visualizes the real-time activity, tool execution, background subagents, teammate delegation, and permissions of **GitHub Copilot** (CLI & agent runtime) and **Google Antigravity** agents inside a customizable office environment.

---

> ### ⚠️ Trademark Disclaimer
>
> **Pixel Office is an independent community-driven extension and is not affiliated with, endorsed by, or sponsored by GitHub, Inc. or Microsoft Corporation.**  
> GitHub, GitHub Copilot, VS Code, and Visual Studio are trademarks or registered trademarks of GitHub, Inc. or Microsoft Corporation in the United States and/or other countries.

---

## 🌟 Key Features

- 🏢 **Interactive Virtual Office**: Watch AI agents walk across the office, sit at assigned desks, collaborate, and type as they process code, run commands, or edit files.
- 🤖 **Multi-Agent & Runtime Support**: Built-in support for **GitHub Copilot CLI** and **Google Antigravity** agent sessions, automatically detecting lead agents and subagents.
- 🎨 **Customizable Layouts & Furniture**: Rearrange desks, chairs, PCs, plants, whiteboards, sofas, walls, and carpets with an intuitive in-editor layout tool.
- 🐾 **Office Pets**: Adopt playful office pets that wander around, including the new HD **Mimi** pet and **PixelCat**.
- 🔒 **Privacy & Local-First**: Zero telemetry sent to external servers. All session discovery, hooks, and communication occur locally on loopback (`127.0.0.1`) with consent-gated execution.
- 🌐 **Integrated & Standalone**: Use it embedded as a VS Code webview panel or standalone in your preferred web browser via the local server.

---

## 🚀 Getting Started

### Installation

Install **CopilotPixel** from the [Visual Studio Code Marketplace](https://marketplace.visualstudio.com) or download the `.vsix` file from the [GitHub Releases](https://github.com/Chuucommie/CopilotPixel/releases) page.

### Usage in VS Code

1. Open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`).
2. Type `CopilotPixel: Show Panel` and press Enter.
3. Start any GitHub Copilot CLI session or Antigravity task — your agents will automatically spawn and begin working in your office!

### Standalone Browser Mode

The local server can also be launched via npm:

```sh
npx copilot-pixel
```

---

## 🛠️ Development

```sh
# Clone repository
git clone https://github.com/Chuucommie/CopilotPixel.git
cd CopilotPixel

# Install dependencies
npm install

# Build extension and webview
npm run build

# Run unit and contract tests
npm test
```

---

## 📜 Credits & Attributions

CopilotPixel is proud to be built upon open source projects and creative assets:

- **Upstream Project**: Based on the open-source **[Pixel Agents](https://github.com/pixel-agents-hq/pixel-agents)** project by **Pablo De Lucca** & `pixel-agents-hq` contributors (released under the [MIT License](https://opensource.org/licenses/MIT)).
- **Character Sprites**: Characters based on the **MetroCity** pack by **JIK-A-4** (released under the [Creative Commons Zero (CC0 1.0 Universal) Public Domain Dedication](https://creativecommons.org/publicdomain/zero/1.0/)).
- **Font**: **FS Pixel Sans Unicode** font created by **NZWStudios2024** on FontStruct (released under the [SIL Open Font License 1.1](https://openfontlicense.org/open-font-license-resources/)).
- **Custom Pets**: Dedicated HD pixel art pet **Mimi** and **PixelCat**.

See [ATTRIBUTIONS.md](ATTRIBUTIONS.md) and [LICENSE](LICENSE) for full licensing terms and legal notices.

---

## 📄 License

MIT License. Copyright (c) 2026 Chuucommie, Copyright (c) 2024-2026 Pablo De Lucca & pixel-agents-hq contributors.
