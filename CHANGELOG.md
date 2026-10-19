# Changelog

## v1.4.9

### Major Rebranding to "Pixel Office", Subagent Break Room Routine & Pure Visual Architecture

- **Rebranded to Pixel Office**:
  - The application has been unified and renamed to **Pixel Office** (`pixel-office`).
  - View container `pixel-office-panel` titled **Pixel Office** with primary view `pixel-office.panelView`.
  - Commands updated to `pixel-office.showPanel` and `pixel-office.exportDefaultLayout` with backward-compatible aliases for `copilot-agents.*`.
  - Settings migrated to `pixel-office.*` with automated migration from legacy configs.
  - User state directory transitioned to `~/.pixel-office/` and workspace state to `.pixel-office/` with seamless migration from `.copilot-pixel/`, `.copilot-agents/`, and `.pixel-agents/`.
  - Standalone binary command updated to `pixel-office` (with `copilot-pixel` and `copilot-agents` aliases).
- **Subagent Break Room Life & Chat Summoning**:
  - Eliminated standalone background agents in favor of a natural team dynamic: the **Chat Agent** (`👑 Project Lead`) and the **Subagents**.
  - Subagents are permanent office members who spend their downtime in the **Break Room** enjoying 4-frame animated coffee sipping with steam, eating donuts with sprinkles and crumbs, playing on the Steam Deck, and socializing in the lounge.
  - When the Project Lead assigns a subtask or executes tools, the called subagent wakes up from their break, heads to their workstation, and performs their task with live dialogue and speech bubbles.
  - Upon task completion, the Project Lead thanks the subagent, and the subagent immediately heads back to the Break Room to relax.
- **Pure Visual Roster & Live Team Dialogue**:
  - The roster panel is strictly observational/visual, displaying the hierarchical tree of the Project Lead and subagents.
  - Includes real-time inter-agent dialogue feed (`💬 Live Team Dialogue`) reflecting active AI tool use and completions.

## v1.4.8

### Autonomous AI Delegation, Subagent Persistence, Break System & UI Reorganization

- **Subagent Sprite Uniqueness & Permanent Persistence**:
  - Subagents spawned from a parent agent receive a distinct character base palette and unique hue shift, ensuring they never look identical to the parent.
  - Subagents and background agents are real, permanent entities marked with `isCopilotPixelAgent` that persist across layout edits, screen switches, and VS Code restarts (`copilotPixelStore`).
  - Ephemeral chat closures no longer despawn or delete persistent CopilotPixel agents.
- **Distinctive `👾 CPX` Badge**:
  - Distinctive pixel-art retro badge (`👾 CPX` / `👾 CopilotPixel`) on character overlays and Agent Roster cards, clearly distinguishing background autonomous agents from temporary Copilot Chat agents.
- **Autonomous AI Delegation & Auto-Spawning**:
  - Autonomous agents can now self-delegate subtasks (`delegate_task`) to specific teammate roles (e.g., Tester, Architect, Reviewer) and spawn new helper subagents (`spawn_agent`) on the workspace on their own according to high-level directives.
  - Live feedback and cascade task dispatches are displayed on screen and logged in the panel.
- **Post-Task Break Routine ("Taking a break...") & Custom Pixel Art Animations**:
  - Once completed, CopilotPixel agents never disappear from the office.
  - Agents enter relaxing break routines in common areas:
    - **Steaming Coffee Mug**: Walks to the coffee machine (`COFFEE` / `COFFEE_TABLE`) and drinks from a ceramic mug with animated rising steam wisps.
    - **Snack Corner**: Visits snack tables (`TABLE` / `COFFEE_TABLE`) to enjoy pastries with nibble animations and crumbs.
    - **Steam Deck on Sofa**: Sits on the sofa (`SOFA` / `BENCH`) playing with a handheld Steam Deck console featuring grip handles, controls, and an animated glowing retro screen.
  - When given a new directive, agents immediately get up from the break area, walk back to their desk, and resume work. Break/working state is fully preserved across restarts.
  - Manual break triggers (`☕ Coffee`, `🍩 Snack`, `🎮 Steam Deck`) and `💼 Resume Work` controls added to the Agent Roster.
- **UI Reorganization**:
  - **Layout Presets in Layout Mode**: Moved the Office Layout Presets selector into the Layout mode toolbar (`EditActionBar`), accessible anytime via the `📐 Presets` button to switch between 2 Normal, 2 Medium, 2 Large, and HQ layouts.
  - **CopilotPixel Default Model in Settings**: Replaced presets in `SettingsModal` with a configuration selector for the default AI model used by CopilotPixel background agents (`Auto: Lowest Cost / Fast`, `GitHub Copilot Economy`, `Google Gemini Fast`).

## v1.4.7

### Autonomous Background Agent Execution & Low-Cost Copilot/Gemini Model Engine

- **Autonomous Background Agent Execution**:
  - Direct orders assigned via the Agent Roster panel now execute real AI directives continuously in the background on the active workspace, running independently of the manual chat window.
  - Integrated directly with VS Code's official Language Model API (`vscode.lm`), leveraging the developer's existing GitHub Copilot and Google Gemini subscriptions without requiring external paid API keys.
  - **Intelligent Low-Cost Model Selection**: Automatically selects and prioritizes the most cost-effective and lightweight models (`gpt-4o-mini`, `gemini-*-flash`, `luna`, `haiku`, `turbo`, `lite`) to preserve subscription quotas.
  - **Model Preference Selector**: Added options in the Agent Roster to choose between `Auto (Lowest Cost / Fast)`, `GitHub Copilot (Economy: gpt-4o-mini / luna)`, and `Google Gemini (Fast: gemini-flash)`.
- **Workspace Tool Calling & Live Office Sprites**:
  - Autonomous agents can search files (`list_files`), read code (`read_file`), write/edit files (`write_file`), and complete tasks (`finish`).
  - While reading files, the agent streams live events to the pixel office: the character sits at their desk, takes out a document, and animates `sprites.reading` with `Reading <filename>` in real time.
  - While writing or modifying files, the character sits at their computer and animates typing with `Editing <filename>`.
- **Full Execution Controls, Reports & Delegation**:
  - Live execution status card in the Agent Roster panel with animated gear `⚙️`, step indicator, active model label, and an immediate `Stop / Cancel` button to abort running tasks at any time.
  - When finished, directives display a green `✅ Completed` card with the full summary of work performed.
  - Delegating tasks to teammates or spawning helper subagents automatically dispatches background AI execution for the assigned target.
  - Character tool overlays in the virtual office display live execution badges `(⚙️ reading ...)`.
- **Dedicated Output Channel**:
  - Added the `CopilotPixel Autonomous Agents` output channel in VS Code for inspecting full background execution traces, tool arguments, and model output.

## v1.4.6

### Agent Roles, 50 English Names, Team Directives & Office Layout Presets

- **Precise Action & Reading Detection (Copilot & Antigravity)**: Fixed issue where Copilot was limited to "Thinking..." and never shown reading files. Parsed VS Code Copilot Chat `references`, `reference`, `inlineReference`, `codeCitations`, `textEditGroup`, and `progressTask` streaming records. Added keyword and case-insensitive taxonomy mapping so that inspecting files dynamically triggers the `Reading` sprite (`sprites.reading`) and descriptive status labels ("Reading <filename>", "Editing <filename>").
- **Agent Roster & Directives Panel**: Introduced a dedicated Agent Roster modal (`AgentRosterModal`) accessible from the bottom toolbar (`Agents` button). Users can view all active agents and subagents, inspect live activity, change roles, rename agents, and issue direct directives.
- **50 Random English Names Pool**: Added a pool of 50 distinctive English names (`ENGLISH_NAMES_50`) assigned randomly to new agents upon creation. Names can be edited inline or re-rolled with a one-click `🎲 Random` button. Custom names and roles are persisted in `localStorage`.
- **Structured Agent Roles**: Introduced 8 specialized team roles with unique icons and color badges:
  - `Lead` (👑 Project Lead, Gold)
  - `Architect` (🏛️ System Architect, Purple)
  - `Coder` (💻 Full-Stack Coder, Blue)
  - `Researcher` (🔍 Researcher, Cyan)
  - `Reviewer` (📝 Code Reviewer, Pink)
  - `Tester` (🧪 QA & Tester, Green)
  - `DevOps` (⚙️ DevOps & SRE, Orange)
  - `Generalist` (🤖 Generalist Assistant, Slate)
- **Direct Orders & Agent-to-Agent Delegation**: Users can give specific task directives to any agent. Agents can also delegate tasks to other teammates or spawn new helper subagents with a chosen role and task description right into the office.
- **Office Layout Presets (2 Normal, 2 Medium, 2 Large + Default)**: Added an office layout preset picker in Settings with 7 complete, functional environments:
  - `Default HQ` (Default classic 2-room layout, 21x22)
  - `Cozy Startup` (Normal 1, 18x16 - 4 workstations, coffee table, plant, bookshelf)
  - `Compact Studio` (Normal 2, 20x16 - 6 workstations in 2 pods, whiteboard, lounge)
  - `Tech Branch` (Medium 1, 24x17 - 8 workstations in 2 pods, separate conference room)
  - `Creative Agency` (Medium 2, 26x18 - 10 workstations with executive lead desk and 4-way sofa lounge)
  - `Open Enterprise` (Large 1, 32x20 - 14 workstations in 3 wings, large boardroom)
  - `Corporate Campus` (Large 2, 36x22 - 18+ workstations across 4 quadrants, boardroom, cafeteria)
- **Enhanced ToolOverlay**: Live badges display custom names, role icons/colors, active task directives (`📋 ...`), and precise action descriptions above agent sprites.

## v1.4.5

### Subagent Spawning, Live Office Animations & Copilot Activity Fixes

- **Multi-Subagent Support in Office**: Unlocked character spawning for all subagent tools (`browser_subagent`, `invoke_subagent`, `runSubagent`, `Task`, `subagent`, `executeTask`). Subagents are now automatically assigned free office desks (`findFreeSeat`) or positioned next to the lead agent, appearing and working as active office team members.
- **Provider Capabilities Synchronization**: Aggregated tool taxonomies across all providers (Google Antigravity + GitHub Copilot) in `CopilotAgentsViewProvider`, ensuring webview classification of reading tools and subagent tools is complete for all agent types.
- **Dynamic Office Animations (Reading vs. Typing)**: Synchronized sprite animation states so agents and subagents dynamically switch to the `reading` sprite when inspecting files or searching (`view_file`, `readFile`, `list_dir`, `grep_search`, `searchCode`, `fetchWeb`) and `typing` when writing code, editing files, or running terminal commands (`runInTerminal`, `editFiles`, `run_command`, `write_to_file`).
- **Unfrozen Copilot Activity Labels**: Fixed state update deduplication in `useExtensionMessages` so Copilot agents fluidly transition from 'Thinking...' to 'Responding...' and individual tool progress labels instead of getting stuck on 'Thinking...'.
- **Enhanced Tool Parsing**: Added support for `toolInvocationSerialized`, terminal command line execution data, and property-level delta completion (`isComplete: true`) in VS Code Copilot Chat.
- **Subagent Live Status Overlay**: Subagent activity status labels are now displayed directly above their heads in real-time without requiring selection.

## v1.4.4

### Live Agent Status & Activity Labels

- Replaced static "Idle" fallback text with live status tracking across both GitHub Copilot Chat and Antigravity sessions.
- Added live "Thinking..." status when an agent begins processing a new prompt turn.
- Added live "Responding..." status during streaming markdown response generation.
- Integrated native VS Code chat invocation messages (`invocationMessage` and `pastTenseMessage`) for detailed live activity labels (e.g., "Reading package.json", "Running command").
- Updated turn completion state to display "Waiting for input" / "Done" with active status indicators instead of "Idle".
- Ensured active status indicators pulse green dynamically whenever the agent is actively working.

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
