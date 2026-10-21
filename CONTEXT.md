# Pixel Office (CopilotPixel)

Pixel Office turns AI coding sessions (GitHub Copilot and Google Antigravity) into animated characters in a retro 2.5D pixel-art virtual office. This glossary is the canonical language for contributors and integrators; end-user docs may simplify it but must never contradict it.

## Hosts & Adapters

**Host**:
The machine Pixel Office runs on — a laptop, a desktop workstation, a VPS, or a remote container. The office is the same on every host and can be accessed locally or remotely.
_Avoid_: platform, environment, server (that is the runtime process)

**Adapter**:
The integration that connects an editor or application — VS Code extension, standalone web server, or future IDE surfaces — to Pixel Office. An adapter composes the runtime and the office UI, binding them to that environment's terminals, storage, and conventions:

1. **VS Code Extension Adapter**: Runs embedded inside a VS Code webview panel, interfacing directly with the VS Code Extension Host, Language Model API (`vscode.lm`), active Copilot chat sessions, and workspace file changes via `vscode.postMessage`.
2. **Standalone Adapter**: A lightweight Fastify and WebSocket server (`server/src/server.ts`) running outside VS Code, monitoring terminal sessions, CLI hooks, log directories, and Antigravity JSONL transcripts, streaming normalized state to browser clients.
   _Avoid_: host (that is the machine it runs on), surface, flavor, platform, edition

**Standalone**:
The adapter that serves the office to a browser from a local Fastify server, independent of any editor.
_Avoid_: CLI (that is the entry command, not the adapter), browser mode

## Agents, Hierarchy & Roles

**Agent**:
An AI coding session tracked by Pixel Office, whether spawned from the office, run autonomously in the background, or adopted from an external terminal or CLI.
_Avoid_: bot, terminal (as a synonym), session (as a synonym)

### Agent Roles & Hierarchy

Based on architectural research, characters in Pixel Office fulfill distinct structural roles:

- **Main Lead** (`"main"` / `"lead"`):
  The primary conversational orchestrator (Copilot or Antigravity Lead agent). Anchored at the central master desk, it coordinates tasks, delivers orders, and mentors subagents.
  _Avoid_: orchestrator, boss

- **Terminal Worker** (`terminal_<id>`):
  Direct CLI / bash execution agent running build tools, test suites, or package managers. Characterized by high typing intensity and dedicated desk allocation.

- **Subagent** (`sub_<toolCallId>`):
  A specialized worker spawned dynamically to perform discrete tool invocations (file reads, writes, searches, or code generation). Spawns into the office, allocates an open desk, executes the tool with live speech bubbles and animated props, and returns to the break room or lead upon completion.
  _Avoid_: subtask (UI label prefix only)

- **Autonomous Worker** (`auto_<uuid>`):
  A long-running autonomous agent with backlog order queues (leveraging low-cost Copilot/Gemini models via `vscode.lm`). Maintains a persistent desk assignment and cycles between deep work, research, coffee runs, and rest.

- **Peer / Colleague**:
  Ambient AI agents simulating office colleagues. Follows Elder Scrolls-style Radiant AI routines, mingling in the break room, getting coffee, and chatting.

**Headless agent**:
An agent with no terminal — a non-interactive run adopted from outside the office, for example. A full citizen: it has a seat and can be selected, but there is no terminal to focus. Agents it spawns are subagents or teammates like anyone else's. Optionally drawn as a Ghost.

**Character**:
The animated pixel-art figure representing an agent in the office. An agent has a status and a session; its character has a position, orientation, props, and an animation state.
_Avoid_: avatar, sprite (a sprite is the image asset, not the figure)

**Ghost**:
A character drawn translucent because its agent is headless — the visual shorthand for "nothing to focus here". Opt-in: off unless the user turns on "Display Headless as Ghosts", and never used in adapters without terminals, where every agent would qualify and the cue would say nothing.

**Team**:
A Lead plus the Teammates it spawned. A team exists because a teammate was spawned — whether or not the CLI recorded one. A CLI's team registry is evidence of a team, never its definition.

**Lead**:
The agent that spawned a Team's teammates. An agent becomes a lead the moment it spawns its first teammate.
_Avoid_: parent (that is the subagent relationship)

**Teammate**:
A named agent spawned by another agent — the name is what makes it a teammate. Its spawner is its Lead, and together they form a Team. Every teammate has its own transcript and sits in a seat; it may or may not have its own session or terminal — how it runs never changes what it is.

## Agent Lifecycle

**Launch**:
Start a new agent from the office.
_Avoid_: spawn (that is the character-level visual event), create

**Adopt**:
Begin tracking a session that was started outside the office. An adopted agent is a full citizen.
_Avoid_: import, attach

**Spawn / Despawn**:
The character-level visual event: a character materializing into or dissolving out of the office with a retro pop or matrix effect. An agent is launched or adopted; its character spawns.

**Dismiss**:
Remove an agent from the office by user choice, without judging its session. A dismissed session is not re-adopted.
_Avoid_: close, delete

**Orphaned**:
An agent whose transcript has been deleted, so the session it represents no longer exists. The office removes orphaned agents automatically.
_Avoid_: stale (implies inactivity or age, which never removes an agent), dead, ended

## Interaction

**Select**:
Mark a character as the current subject in the office (the white outline). Selection is what seat reassignment and inspector drawers operate on.
_Avoid_: focus (reserved for terminals), highlight

**Follow**:
The camera tracking the selected character across the office. Ends on manual pan or deselection.
_Avoid_: track

**Focus**:
Bring an agent's terminal to the front. Reserved exclusively for terminals — never the in-office highlight.

## First Run

**Intro**:
The four-step first-run tour the Greeter speaks: welcome to Pixel Office, supported AI runtimes (GitHub Copilot & Google Antigravity), hooks consent, and all set.
_Avoid_: onboarding, tutorial, wizard, consent modal

**Greeter**:
The character that speaks the Intro. Not an agent and not a Pet: it has no session, takes no seat, never wanders, and exists exactly as long as the Intro is open.
_Avoid_: mascot, tutorial character

## Agent Status & Finite State Machine (FSM)

**Active**:
An agent that is executing its turn or tool invocation.
_Avoid_: busy, working, running

**Inactive**:
An agent that is not executing. Comes in three conversational forms: done, waiting for input, or permission request.
_Avoid_: waiting (the wire protocol's historical umbrella term), idle

**Done**:
The inactive form where the agent finished its turn and nothing is pending.

**Waiting for input**:
The inactive form where the agent asked the user something and is blocked on a reply.

**Permission request**:
The inactive form where the agent is blocked until the user approves a tool use. Unlike the other two forms, it can occur mid-turn.

### Simulation Finite State Machine (13 States)

Every character possesses an internal state machine governed by `CharacterState`:

- `SPAWN`: Character enters at the office entrance / elevator (`col: 0, row: 1` or configured entrance tile), plays an entry pop animation, and requests seat assignment.
- `WALK`: Moves across tiles using a 4-connected Breadth-First Search (BFS) pathfinder with delta-time adjustment and dynamic facing directions (`up`, `down`, `left`, `right`).
- `SIT`: Character anchors to the chair tile, lowers torso into sitting posture, and locks orientation towards the desk.
- `TYPE`: Procedural typing animation with oscillating Bézier arms and floating code particles (`0`, `1`, `{}`, `;`). Speed doubles during file editing or bash runs.
- `THINK`: Head bob animation with thought bubbles displaying active LLM reasoning tokens or lightbulbs.
- `DRINK`: Character picks up coffee mug, sips for 3 seconds, increments hydration/energy meter, and returns the mug or washes it in the break room sink.
- `BREAK`: Downtime behavior in the break room. Includes relaxing on sofas playing Steam Deck, eating donuts with crumbs, or socializing.
- `DANCE`: Celebratory disco dancing triggered on task completion, test suite passing, or user cheers.
- `SLEEP`: Deep rest or desk nap with floating animated `zzz` particles when idle for long periods.
- `PRESENT`: Whiteboard presentation posture where the Main Lead points a laser pointer at office diagrams.
- `MATRIX_RAIN`: Matrix phosphor code rain overlay activated when large background builds or agent swarms run.
- `ROUTINE`: Elder Scrolls Radiant AI-inspired daily schedule behaviors.
- `CELEBRATE`: Victory animation and speech dialogues upon directive success.

### Radiant AI & Routine Manager

The simulation incorporates an Elder Scrolls Radiant AI schedule simulator (`routineManager.ts`) featuring:

- **Workday Phases**:
  - `08:00 - 09:30`: Morning Arrival & Coffee Run (high break room traffic, kitchen unit interactions).
  - `09:30 - 12:30`: Deep Work Sprint (all agents seated, intense typing, tool execution).
  - `12:30 - 14:00`: Lunch Break & Social Mingle (kitchen gathering, lounge sofa occupation).
  - `14:00 - 17:30`: Afternoon Collaboration & Mentoring (lead visits subagent desks, whiteboarding).
  - `17:30 - 19:00`: Wind-down & Departure.
- **Personality Archetypes**: _The Workaholic_ (stays at desk, drinks extra coffee), _The Socialite_ (frequent water cooler chats), _The Slacker_ (extended sofa naps, Steam Deck gaming).

**Activity label**:
The human-readable line describing what an agent is doing right now (e.g. "Reading foo.ts", "Running npm test"), shown above its character.
_Avoid_: status text, tool status

**Speech bubble**:
The indicator above a character announcing a tool or form of inactivity: "…" for a permission request (stays until resolved), a checkmark for a finished turn, or active tool/completion dialogues.
_Avoid_: bubble alone when ambiguous, notification

**Context gauge**:
The small bar under an agent's activity label showing how full its context window is. Every primary agent has one once it has taken a turn; subagents never do, having no session of their own. It reads the newest turn, so it falls when a session compacts or clears — it is a level, not a total.
_Avoid_: fuel gauge, health bar, token gauge

## Office, Layout & Break Room

**Office**:
The whole simulated world: the layout plus its inhabitants — characters and pets — and their live state.
_Avoid_: map, scene, room, level

**Layout**:
The office's spatial arrangement: the tile grid, floors, walls, carpets, areas, and furniture. It is the part of the office that the editor edits and that can be exported and shared.
_Avoid_: floor plan, blueprint, map

**Break Room**:
A dedicated recreational area within the office layout (featuring kitchen units, continuous marble counters, espresso machine, tea station, microwave oven, refrigerator, lounge sofas, and dining tables). Subagents spend their downtime here enjoying snacks, playing Steam Deck, and chatting between task calls.

**Tile**:
One cell of the office grid (16x16 pixels).

**Floor**:
The walkable surface of a tile, painted with a pattern and color.

**Wall**:
A blocking tile that visually connects to adjacent walls.

**Carpet**:
A decorative layer painted over floor tiles.

**Area**:
A named region of tiles. Areas exist so workspace folders can be mapped to them.
_Avoid_: zone, region

**Area mapping**:
The assignment of a workspace folder to one or more areas. Many folders may share an area. Agents launched from a folder prefer seats inside any of its areas.

**Furniture**:
A placeable item in the layout — desks, chairs, storage, electronics, decor, kitchen appliances, and sofas.
_Avoid_: object, prop, item

**Desk**:
Furniture that seats face and that hosts surface items (such as realistic MacBook laptops, monitors, coffee mugs). An agent's character sitting at its desk is the visual expression of being active.

**Seat**:
A sittable spot the office derives from chair furniture, assignable to exactly one agent.
_Avoid_: chair (that is the furniture), workstation

**Chair**:
The furniture category whose items create seats. Every footprint tile of a chair yields one seat.

**Seat assignment**:
Which agent owns which seat. Persisted across reloads, and changeable by selecting a character and clicking a free seat.

**Pet**:
An animated creature that lives in the office and belongs to no agent (such as Mimi HD or PixelCat). Purely decorative; wanders playfully.
_Avoid_: mascot, animal

**Wander**:
The stroll a character takes away from its seat while its agent is done or in the break room. Characters whose agents are waiting for input or awaiting a permission stay seated.
_Avoid_: roam, patrol

## Activity Detection & Integration Boundary

**Hook**:
A push notification an AI tool sends about its own session activity, delivered to Pixel Office as it happens.

**Transcript**:
The append-only record of a session (e.g., GitHub Copilot JSONL sessions or Google Antigravity JSONL transcripts). Read in both detection modes for tool content and prompt tracking.
_Avoid_: log

**Hooks mode**:
The preferred detection mode, in which agent status is driven by real-time CLI and runtime hooks.

**Heuristic mode**:
The fallback detection mode, in which agent status is inferred from transcript activity, file watchers, timers, and silence.
_Avoid_: file fallback, transcript mode, polling mode

**Provider**:
The integration that connects a coding-agent CLI or runtime to Pixel Office. A provider normalizes raw activity into agent events and knows how to install hooks:

- **GitHub Copilot Provider**: Connects to GitHub Copilot CLI and VS Code Copilot agent sessions.
- **Google Antigravity Provider**: Connects to Google Antigravity transcripts and autonomous subagent runs via `transcriptParser.ts`.
  _Avoid_: plugin, connector

**Agent event**:
The canonical, CLI-agnostic description of something happening in a session: a tool started, a turn ended, a subagent spawned, a teammate went idle. Providers produce agent events; everything downstream consumes only these, never provider-specific names.
_Avoid_: hook event (the raw payload before normalization)

**Runtime**:
The adapter-independent core (`AgentRuntime`, `AgentStateStore`, `SessionRouter`) that tracks agents and drives the office. It is separate from the adapters that compose it, the providers that feed it, and the office UI it serves.
_Avoid_: server, backend

**Transport**:
The channel carrying protocol messages between the office UI and the runtime (`PostMessageTransport` in VS Code, `WebSocketTransport` in standalone).
_Avoid_: connection, socket

**Protocol**:
The message contract between the office UI and the runtime, shared by every adapter and defined in a single source of truth (`shared/agentEvents.ts`, `webview-ui/src/types/extension.ts`, and AsyncAPI specifications).
_Avoid_: API

**Persistence Directory**:
User configuration is stored in `~/.pixel-office/` (with automated migration from legacy `~/.copilot-agents/`, `~/.copilot-pixel/`, and `~/.pixel-agents/`), and workspace state in `.pixel-office/`.
