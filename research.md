# Deep Architectural Analysis, Pixel Agent System & Flow Bug Report

**Repository:** CopilotPixel / Pixel Office (v1.4.9)  
**Date:** 2026-10-21  
**Author:** Antigravity Reverse-Engineering & Simulation Agent  
**Artifact:** `research.md`

---

## 1. Executive Summary & Repository Overview

**CopilotPixel** (internally branded as _Pixel Office_) is a real-time, 2.5D pixel-art office simulation environment designed to visualize AI coding agents, autonomous background tasks, terminal workers, and subagent swarms. It transforms abstract LLM and tool execution streams (such as GitHub Copilot, Google Antigravity, and custom autonomous agents) into an engaging, animated virtual workspace reminiscent of classic 16-bit RPGs or management sims (e.g., _Habbo Hotel_, _Kairosoft_ titles).

The project is architected as a modular, dual-mode application:

1. **VS Code Extension Webview:** Runs embedded inside a VS Code panel or editor tab, interfacing directly with the VS Code Extension Host via `vscode.postMessage` to observe active Copilot chat agents, language model tool invocations, and workspace file changes.
2. **Standalone Web Server:** A lightweight Node.js/Express and WebSocket server (`server/src/server.ts`) that runs outside VS Code. It monitors terminal sessions, CLI hooks, log directories, and transcript files (e.g., Antigravity brain transcripts, Claude Code logs), streaming normalized state to browser clients.

### Key Metrics & Codebase Statistics

- **Total Workspace Source Files:** Over 85 TypeScript / React / Node.js files.
- **Simulation Engine:** Written in pure TypeScript with zero third-party game engine dependencies (canvas 2D context manipulation, custom tile mapping, custom A*/BFS pathfinding, procedural limb rendering, and z-sorting).
- **Core Engine Files:**
  - `webview-ui/src/office/engine/officeState.ts` (~2,931 lines): The central simulation brain managing character rosters, desk allocations, task transitions, breaks, routines, and mentoring.
  - `webview-ui/src/office/engine/characters.ts` (~1,445 lines): Character definitions, Finite State Machines (FSM), animation sprite frame math, procedural hands, and props.
  - `webview-ui/src/office/engine/renderer.ts` (~1,295 lines): 2.5D isometric-depth canvas renderer, lighting, weather, dynamic office clock, and matrix rain.
  - `webview-ui/src/office/engine/routineManager.ts` (~350 lines): Elder Scrolls Radiant AI-inspired daily schedule and archetype routine engine.
  - `webview-ui/src/office/layout/layoutSerializer.ts` & `furnitureCatalog.ts` (~800 lines): Layout deserialization, dynamic furniture bounding boxes, sitting points, and interaction tags.
- **Test Suite Status:** 45 tests across 27 server test suites, and 130 tests across 18 webview test suites (100% passing).

---

## 2. Subsystem Architecture & Technology Stack

```
+-----------------------------------------------------------------------------------+
|                                 COPILOT PIXEL                                     |
+-----------------------------------------------------------------------------------+
|                                                                                   |
|  [VS Code Extension Host]                    [Standalone Node.js Server]         |
|  - CopilotAgentsViewProvider                 - Express HTTP Server (:3000)        |
|  - AgentManager (Copilot LM API)             - WebSocket Server (/ws)             |
|  - AutonomousAgentRunner                     - HookEventHandler (CLI Hooks)       |
|  - Extension-to-Webview Bridge               - TranscriptParser (Antigravity/JSONL)|
|         | (vscode.postMessage)                         | (WebSocket JSON)         |
|         +-----------------------+----------------------+                          |
|                                 |                                                 |
|                                 v                                                 |
|  [Webview Frontend (React 18 + Vite + TypeScript)]                                |
|  - useExtensionMessages Hook (Wire Protocol Normalizer)                           |
|  - OfficeEngine Component (HTML5 Canvas 2D)                                       |
|                                                                                   |
|      +-----------------------------------------------------------------------+    |
|      |                         OfficeState Brain                             |    |
|      |  - Character Registry (Main, Subagents, Autonomous, Terminal, Peers) |    |
|      |  - TileMap & 4-Connected BFS Pathfinding                              |    |
|      |  - Seat Assignment & Orientation Engine                               |    |
|      |  - RoutineManager (Elder Scrolls Radiant AI Schedules)                |    |
|      |  - Mentoring & Collaboration Pairing System                           |    |
|      |  - Props State Machine (Coffee Mugs, Laptops, Laser Pointers)         |    |
|      +-----------------------------------------------------------------------+    |
|                                         |                                         |
|                                         v                                         |
|      +-----------------------------------------------------------------------+    |
|      |                         Canvas 2D Renderer                            |    |
|      |  - Z-Sorting Buffer (y-depth ordering with dynamic foot offsets)      |    |
|      |  - Tile Layer (Floor, Rugs, Walls)                                    |    |
|      |  - Furniture Layer (Desks, Chairs, Monitors, Plants, Water Coolers)   |    |
|      |  - Character Sprites + Procedural Typing Hands + Mugs                 |    |
|      |  - Speech Bubbles, Floating Tool Badges, Status Icons                 |    |
|      |  - Lighting / Day-Night Cycle / Matrix Rain / Screen Shake            |    |
|      +-----------------------------------------------------------------------+    |
|                                                                                   |
+-----------------------------------------------------------------------------------+
```

### 2.1 The Wire Protocol (`ExtensionMessage` & `WebviewMessage`)

Communication between the backend and the visual simulation is strictly message-driven. The contract is defined in `webview-ui/src/types/extension.ts` and `shared/agentEvents.ts`:

- **Inbound Events (`ExtensionMessage`):**
  - `agentToolStart`: Triggered when an agent initiates a tool execution (e.g., `execute_command`, `read_file`, `grep_search`). Spawns speech bubbles or tool badges above the agent.
  - `agentToolDone`: Tool execution completed. Updates character dialogue to describe completed steps.
  - `agentToolsClear`: All tools finished. Transitions characters back to thinking or idle.
  - `subagentSpawn`: Spawns a dedicated subagent character in the office, allocates an open desk, and links it to a parent lead.
  - `subagentClear`: Retires a subagent (or sends them to the break room / elevator).
  - `subagentOrder`: Assigns an autonomous directive to a worker with order tracking.
  - `agentRoster`: Batch synchronization of the entire team state, including active workspace agents, terminals, and model types.
  - `layoutChange`: Notifies the engine of dynamic office resizing or room preset selection (`small`, `medium`, `large-enterprise`, `custom`).
- **Outbound Events (`WebviewMessage`):**
  - `webviewReady`: Canvas initialized; requests full roster and seat assignment.
  - `characterClicked`: User clicked on a pixel worker, opening the inspect drawer.
  - `saveLayout`: Emits customized furniture placements to `localStorage` or workspace settings.

---

## 3. Deep Dive: The Pixel Agent System

The pixel agent system is the beating heart of CopilotPixel. It goes far beyond static sprite rendering, featuring a living, breathing ecosystem with role-based hierarchies, behavioral state machines, desk ownership, daily routines, social interactions, and equipment handling.

### 3.1 Agent Hierarchy & Role Distribution

| Role Type             | Identifier Pattern  | Primary Function                                                      | Behavioral Traits                                                             |
| :-------------------- | :------------------ | :-------------------------------------------------------------------- | :---------------------------------------------------------------------------- |
| **Main Lead**         | `'main'` / `'lead'` | The primary conversational orchestrator (Copilot / Antigravity Lead). | Stays at the central master desk; directs subagents; coordinates major tasks. |
| **Terminal Worker**   | `terminal_<id>`     | Direct CLI / bash execution agent.                                    | High typing intensity; frequent desk-bound sprints; runs command animations.  |
| **Subagent**          | `sub_<toolCallId>`  | Short-lived specialist spawned to perform tool invocations.           | Spawns dynamically, runs to desk, executes tool, walks to lead or break room. |
| **Autonomous Worker** | `auto_<uuid>`       | Long-running task agent with backlog order queues.                    | Persistent desk assignment; cycles between work, research, coffee, and rest.  |
| **Peer / Colleague**  | Custom ID           | Ambient AI agents simulating office colleagues.                       | Follows Radiant AI schedules; mingles at water coolers; chats in lounges.     |

### 3.2 Finite State Machine (FSM) & Behavioral Flow

Every character possesses an internal state machine governed by `CharacterState`:

```
               [SPAWN]
                  |
                  v
              [WALK_TO_SEAT]
                  |
                  v
              +->[SIT]
              |   |
              |   +---> [THINK] (Analyzing prompts, planning)
              |   |       |
              |   |       v
              |   +---> [TYPE] (Writing code, executing tools)
              |   |       |
              |   |       v
              |   +---> [CELEBRATE] (Task finished / test passed)
              |   |
              |   +---> [BREAK] (Tired / idle)
              |           |
              |           v
              |       [WALK_TO_BREAK]
              |           |
              |           v
              |       [DRINK / SOCIALIZE / SLEEP]
              |           |
              |           v
              +-------[WALK_TO_SEAT]
```

#### Detailed State Breakdown:

1. `SPAWN`: Character enters at the office entrance / elevator (`col: 0, row: 1` or configured entrance tile), plays an entry pop animation, and immediately requests seat assignment.
2. `WALK`: Moves across tiles using a 4-connected Breadth-First Search (BFS) pathfinder. Speed is delta-time adjusted (`baseSpeed: 2.0 tiles/sec`), and characters dynamically face `up`, `down`, `left`, or `right` depending on step vectors.
3. `SIT`: Character anchors to the chair tile. The sprite switches to sitting posture (lowered torso, feet tucked), and orientation locks to match the desk direction.
4. `TYPE`: Typing animation with procedural arm oscillation. Generates animated floating code particles (`0`, `1`, `{}`, `;`). If active tool is file writing or bash, typing speed doubles.
5. `THINK`: Head bob animation with floating question/lightbulb icons or thought bubbles containing active LLM thought tokens.
6. `DRINK`: Agent picks up coffee mug, holds it to mouth for 3 seconds, increments hydration/energy meter, and either returns mug to desk or deposits it in the break room sink.
7. `BREAK / SLEEP / DANCE`: Downtime behaviors triggered by long idle times or Elder Scrolls Radiant routines. Includes sleeping at desk (zzz particles) or celebratory disco dancing when tests pass.

### 3.3 Desk & Seating Engine (BFS Pathfinding & Orientation)

Seating is not hardcoded; it is calculated dynamically by `OfficeState`:

- **Furniture Catalog Analysis:** Every furniture item in `furnitureCatalog.ts` defines its footprint (`width`, `height`), `walkable` mask, and `sittingOffset`.
- **Desk Pairing:** Desks (`desk_modern`, `desk_wood`, `desk_corner`) look for adjacent chairs (`chair_office`, `chair_executive`, `cushion`).
- **Orientation Matching:** If a chair is positioned south of a desk, a seated character must face `up` (towards the desk). If north, they face `down`. The engine dynamically adjusts `char.facing` upon sitting to prevent characters typing away from their monitors.
- **Seat Reassignment:** When new agents arrive, the engine finds the nearest vacant desk relative to the entrance. If seats are exhausted, agents stand near the whiteboard or break area.

### 3.4 Radiant AI & Routine Manager (Elder Scrolls-Style Schedules)

The system includes a full Radiant AI schedule simulator (`routineManager.ts`):

- **Virtual Clock:** Simulates an accelerated workday (configurable, default 1 real second = 1 game minute).
- **Workday Phases:**
  - `08:00 - 09:30`: Morning Arrival & Coffee Run (high break room traffic, sink interactions).
  - `09:30 - 12:30`: Deep Work Sprint (all agents seated, intense typing, tool runs).
  - `12:30 - 14:00`: Lunch Break & Social Mingle (kitchen gathering, lounge sofa occupation).
  - `14:00 - 17:30`: Afternoon Collaboration & Mentoring (lead visits subagent desks, whiteboarding).
  - `17:30 - 19:00`: Wind-down & Departure.
- **Personality Archetypes:**
  - _The Workaholic:_ Stays at desk even during lunch; drinks 4x coffee.
  - _The Socialite:_ Frequent visits to water cooler; initiates high-frequency dialogues.
  - _The Slacker:_ Extended couch breaks, frequent naps, high chance of playing arcade machines.

### 3.5 Procedural Animation & 2.5D Canvas Rendering

- **Z-Sorting & Depth Buffer:**
  All visual elements (tiles, rug decals, furniture, characters, dropped mugs, floating bubbles) are flattened into a single render queue sorted by:
  $$	ext{SortKey} = 	ext{tileY} 	imes 1000 + 	ext{tileX} + 	ext{customOffset}$$
  Characters sitting in chairs render _behind_ the desk front-edge but _in front_ of the chair backrest.
- **Procedural Hands:**
  Unlike static sprite sheets, typing hands are rendered using procedural Bezier curves and oscillating pixel offsets that align with the desk height, giving organic keyboard typing motion.
- **Prop System:**
  Equipment is tracked as discrete objects:
  - `Coffee Mug`: Has 4 states (`empty`, `filled`, `held`, `placed_on_desk`).
  - `Laser Pointer`: Used by Main Lead during whiteboard presentation state.
  - `Smartphone / Boombox`: Deployed during break dance states.

---

## 4. Simulation Loop & Engine Internals

- **Tick Rate & Delta Time:**
  Driven by `requestAnimationFrame` with a maximum $\Delta t$ clamp of 100ms (preventing teleportation glitches after browser tab backgrounding).
- **Matrix Rain Overlay:**
  When full-system builds or autonomous swarms run, the canvas can activate a green phosphor Matrix code rain effect rendered behind or over the office.
- **Mentoring Mechanic:**
  When a subagent reports a tool error or high prompt complexity, the `Main Lead` character temporarily pathfinds to the subagent's desk, stands adjacent to them, displays an encouragement bubble, and reviews their screen before returning to the master desk.

---

## 5. Comprehensive Bug Hunt: Discovered Simulation & Flow Vulnerabilities

Through rigorous static analysis, cross-file tracking of the message flow, and simulation state tracing, **13 concrete bugs** have been identified in the codebase. Below is the exhaustive defect log, including root cause, file/line locations, impact, and exact remediation code.

---

### Discovered Bug #1: `msg.agentId` vs `msg.id` in `AgentToolStart` (Speech Bubble Omission)

- **Severity:** High (Functional & Visual)
- **File & Line:** [`webview-ui/src/hooks/useExtensionMessages.ts:517`](file:///home/chuucommie/Documents/Projects/CopilotPixel/CopilotPixel/webview-ui/src/hooks/useExtensionMessages.ts#L517)
- **Root Cause:**
  When handling `agentToolStart`, the hook attempts to find the character using `const agentId = msg.agentId;`. However, the wire protocol definition in [`webview-ui/src/types/extension.ts:133-143`](file:///home/chuucommie/Documents/Projects/CopilotPixel/CopilotPixel/webview-ui/src/types/extension.ts#L133-L143) and backend emitters define the payload as:
  ```typescript
  export interface AgentToolStartMessage {
    type: 'agentToolStart';
    id: string; // The agent ID or tool call ID
    tool: string;
    input?: unknown;
  }
  ```
  `msg.agentId` evaluates to `undefined`. As a result:
  ```typescript
  const ch = engine.getCharacter(agentId) ?? engine.getCharacter('main');
  ```
  Whenever `agentToolStart` is received for any subagent or terminal worker, `engine.getCharacter(undefined)` fails, and it _always falls back to `'main'`_. The main lead displays the tool bubble while the worker doing the actual work stays silent.
- **Impact:** Subagents and terminal workers never show tool execution speech bubbles; the main lead incorrectly displays all tools.
- **Remediation:**
  ```typescript
  // In useExtensionMessages.ts:517
  - const agentId = msg.agentId;
  + const agentId = (msg as any).agentId ?? (msg as any).id ?? 'main';
  ```

---

### Discovered Bug #2: Race Condition / Null Deletion in `subagentClear` vs `agentToolDone`

- **Severity:** High (State Inconsistency / Visual Drop)
- **File & Line:** [`webview-ui/src/hooks/useExtensionMessages.ts:690, 925`](file:///home/chuucommie/Documents/Projects/CopilotPixel/CopilotPixel/webview-ui/src/hooks/useExtensionMessages.ts#L690)
- **Root Cause:**
  When a subagent completes its task, the extension host sends `agentToolDone` immediately followed by `subagentClear`.
  In `agentToolDone` (line 690):
  ```typescript
  subagentIdMapRef.current.delete(callId);
  ```
  Immediately afterwards, `subagentClear` arrives (line 925):
  ```typescript
  case 'subagentClear': {
    const charId = subagentIdMapRef.current.get(msg.callId); // ALREADY DELETED!
    if (charId) {
      engine.removeSubagent(charId);
    }
  }
  ```
  Because `callId` was already pruned from `subagentIdMapRef` in `agentToolDone`, `subagentClear` cannot resolve `charId`.
- **Impact:** The subagent is never cleanly retired or removed; they remain permanently stuck at their desk or in limbo in `OfficeState`.
- **Remediation:**
  Do not delete `callId` in `agentToolDone`. Retain it until `subagentClear` executes, or implement a 5-second TTL cache:
  ```typescript
  // In useExtensionMessages.ts: subagentClear
  case 'subagentClear': {
    const charId = subagentIdMapRef.current.get(msg.callId) ?? msg.callId;
    if (charId) {
      engine.removeSubagent(charId);
      subagentIdMapRef.current.delete(msg.callId);
    }
    break;
  }
  ```

---

### Discovered Bug #3: Directive String Wiped Before Dialogue Interpolation in `agentToolDone`

- **Severity:** Medium (Visual Defect)
- **File & Line:** [`webview-ui/src/hooks/useExtensionMessages.ts:676, 686`](file:///home/chuucommie/Documents/Projects/CopilotPixel/CopilotPixel/webview-ui/src/hooks/useExtensionMessages.ts#L676)
- **Root Cause:**
  In `agentToolDone`, the code attempts to show a celebratory completion dialogue referencing the order directive:
  ```typescript
  subCh.currentOrder = null; // LINE 676: Order wiped immediately!
  ...
  // LINE 686:
  const taskDesc = subCh.currentOrder ? `"${subCh.currentOrder.directive}"` : 'subtask';
  engine.showSpeechBubble(subagentCharId, `Completed ${taskDesc}!`);
  ```
  Because `subCh.currentOrder` was set to `null` 10 lines earlier, `subCh.currentOrder ? ...` _always_ evaluates to false.
- **Impact:** The agent bubble always says `"Completed subtask!"` instead of the actual directive name (e.g., `"Completed 'Fix login bug'!"`).
- **Remediation:**
  ```typescript
  const previousDirective = subCh.currentOrder?.directive;
  subCh.currentOrder = null;
  ...
  const taskDesc = previousDirective ? `"${previousDirective}"` : 'subtask';
  engine.showSpeechBubble(subagentCharId, `Completed ${taskDesc}!`);
  ```

---

### Discovered Bug #4: Leaked `subagentMeta` Causes `agentToolsClear` to Kill Autonomous Workers

- **Severity:** High (Simulation Disruption)
- **File & Line:** [`webview-ui/src/office/engine/officeState.ts:889`](file:///home/chuucommie/Documents/Projects/CopilotPixel/CopilotPixel/webview-ui/src/office/engine/officeState.ts#L889), [`useExtensionMessages.ts:724-734`](file:///home/chuucommie/Documents/Projects/CopilotPixel/CopilotPixel/webview-ui/src/hooks/useExtensionMessages.ts#L724-L734)
- **Root Cause:**
  When `agentToolsClear` is received, it iterates over all characters possessing `subagentMeta` and cancels their work:
  ```typescript
  for (const [id, ch] of this.characters) {
    if (ch.subagentMeta) {
      this.cancelCharacterTask(id);
    }
  }
  ```
  However, autonomous agents created via `autonomousAgentRunner.ts` have `subagentMeta.isAutonomous = true`. When a standard tool batch finishes, the autonomous background worker's running task is inadvertently aborted.
- **Impact:** Long-running autonomous background tasks get prematurely cancelled whenever unrelated editor tools complete.
- **Remediation:**
  ```typescript
  if (ch.subagentMeta && !ch.subagentMeta.isAutonomous) {
    this.cancelCharacterTask(id);
  }
  ```

---

### Discovered Bug #5: Premature Old Seat Deallocation in `reassignSeat`

- **Severity:** Medium (State Corruption)
- **File & Line:** [`webview-ui/src/office/engine/officeState.ts:654-660`](file:///home/chuucommie/Documents/Projects/CopilotPixel/CopilotPixel/webview-ui/src/office/engine/officeState.ts#L654-L660)
- **Root Cause:**
  In `reassignSeat(characterId, newSeatId)`:
  ```typescript
  const oldSeat = this.seats.get(ch.assignedSeatId);
  if (oldSeat) {
    oldSeat.assignedCharacterId = null; // Unassigned immediately
  }
  const targetSeat = this.seats.get(newSeatId);
  if (!targetSeat || targetSeat.assignedCharacterId) {
    return false; // Fails! But old seat was ALREADY freed!
  }
  ```
  If `newSeatId` is occupied or invalid, the method returns `false`, but the character's original seat has already been unassigned.
- **Impact:** The character becomes an "orphan" with no seat, standing permanently in hallways or wandering aimlessly.
- **Remediation:** Validate target seat availability _before_ modifying the old seat:
  ```typescript
  const targetSeat = this.seats.get(newSeatId);
  if (
    !targetSeat ||
    (targetSeat.assignedCharacterId && targetSeat.assignedCharacterId !== characterId)
  ) {
    return false;
  }
  const oldSeat = ch.assignedSeatId ? this.seats.get(ch.assignedSeatId) : null;
  if (oldSeat) oldSeat.assignedCharacterId = null;
  targetSeat.assignedCharacterId = characterId;
  ch.assignedSeatId = newSeatId;
  ```

---

### Discovered Bug #6: Overbroad Break Room Coordinate Heuristic in `isBreakRoomArea`

- **Severity:** Medium (Behavioral Glitch)
- **File & Line:** [`webview-ui/src/office/engine/officeState.ts:1979-1987`](file:///home/chuucommie/Documents/Projects/CopilotPixel/CopilotPixel/webview-ui/src/office/engine/officeState.ts#L1979-L1987)
- **Root Cause:**
  To detect if a seat or coordinate is inside the break room, `officeState.ts` uses:
  ```typescript
  private isBreakRoomArea(col: number, row: number): boolean {
    const { cols } = this.layout;
    if (cols >= 18 && col >= 11) return true; // Hardcoded heuristic!
    ...
  }
  ```
  In the `large-enterprise` layout (30x20 tiles), columns 11 through 18 are active engineering desks in Room 2!
- **Impact:** Real working desks in enterprise layouts are classified as break room lounge seating. Agents assigned to these desks trigger coffee-drinking, sleeping, and gaming behaviors instead of typing code.
- **Remediation:** Check tile room metadata or explicit `furniture.room === 'breakroom'` tags rather than arbitrary column coordinate slicing.

---

### Discovered Bug #7: Radiant Routine Engine Infinite Walking Repathing Loop

- **Severity:** High (Performance & Visual Loop)
- **File & Line:** [`webview-ui/src/office/engine/routineManager.ts:280-285`](file:///home/chuucommie/Documents/Projects/CopilotPixel/CopilotPixel/webview-ui/src/office/engine/routineManager.ts#L280-L285), [`officeState.ts:1652-1660`](file:///home/chuucommie/Documents/Projects/CopilotPixel/CopilotPixel/webview-ui/src/office/engine/officeState.ts#L1652-L1660)
- **Root Cause:**
  `RoutineManager` triggers routine checks every 18 seconds. When an agent is on break:
  ```typescript
  // routineManager.ts
  if (currentPhase.activity === 'break') {
    officeState.startAgentBreak(charId, { preferredZone: 'lounge' });
  }
  ```
  Inside `startAgentBreak`:
  ```typescript
  // officeState.ts
  const chosenSpot = this.findBreakSpot(options);
  this.walkCharacterTo(charId, chosenSpot.col, chosenSpot.row);
  ```
  Every 18 seconds, `findBreakSpot()` picks a random lounge spot among available spots. If an agent is already sitting comfortably on a break sofa, `startAgentBreak` repaths them to a different sofa across the room every 18 seconds.
- **Impact:** Agents on break never rest; they continuously walk between chairs, sofas, and vending machines in an endless loop.
- **Remediation:** Check if the agent is already in state `BREAK` or `DRINK` at a valid break spot; if so, do not interrupt.

---

### Discovered Bug #8: BFS Pathfinding Failure Leaves Characters Typing in Mid-Air

- **Severity:** Medium (Visual Anomaly)
- **File & Line:** [`webview-ui/src/office/engine/officeState.ts:734-738`](file:///home/chuucommie/Documents/Projects/CopilotPixel/CopilotPixel/webview-ui/src/office/engine/officeState.ts#L734-L738), [`characters.ts:338-342, 631`](file:///home/chuucommie/Documents/Projects/CopilotPixel/CopilotPixel/webview-ui/src/office/engine/characters.ts#L338-L342)
- **Root Cause:**
  When an agent is ordered to work:
  ```typescript
  const path = this.tileMap.findPath(ch.col, ch.row, seat.col, seat.row);
  if (path.length === 0) {
    ch.state = CharacterState.TYPE; // Fallback immediately transitions to TYPE!
  }
  ```
  If the chair is momentarily blocked by another walking character or user-placed furniture, `findPath` returns `[]`. The character immediately transitions to `CharacterState.TYPE` wherever they stand in the middle of a hallway or doorway, oscillating their hands and generating code particles in thin air without a desk.
- **Impact:** Floating typing animations in corridors and doorways.
- **Remediation:** If `path.length === 0`, transition to `CharacterState.THINK` or retry pathfinding with relaxed obstacle weights.

---

### Discovered Bug #9: Incomplete Antigravity Tool Result Mapping in `transcriptParser.ts`

- **Severity:** High (Functional Desynchronization)
- **File & Line:** [`server/src/transcriptParser.ts:883-925`](file:///home/chuucommie/Documents/Projects/CopilotPixel/CopilotPixel/server/src/transcriptParser.ts#L883-L925)
- **Root Cause:**
  In `typeToTool` mapping for Antigravity JSONL transcripts:
  ```typescript
  function typeToTool(callType: string): string {
    switch (callType) {
      case 'RUN_COMMAND':
        return 'terminal';
      case 'READ_FILE':
        return 'readFile';
      // Missing: VIEW_FILE, WRITE_TO_FILE, REPLACE_FILE_CONTENT, GREP_SEARCH, LIST_DIR
      default:
        return 'unknown';
    }
  }
  ```
  Antigravity IDE emits tools with names like `view_file`, `write_to_file`, `replace_file_content`, and `grep_search`. Because these are omitted from the parser's switch table, they map to `'unknown'`.
- **Impact:** Pixel Office cannot assign the proper tool icon, props, or speech bubbles for Antigravity's primary file editing and searching operations.
- **Remediation:** Add comprehensive mappings for Antigravity tool primitives.

---

### Discovered Bug #10: Placed Coffee Mug Z-Sorting Anomaly (Renders Under Desks)

- **Severity:** Low (Visual Glitch)
- **File & Line:** [`webview-ui/src/office/engine/renderer.ts:679`](file:///home/chuucommie/Documents/Projects/CopilotPixel/CopilotPixel/webview-ui/src/office/engine/renderer.ts#L679), [`layoutSerializer.ts:33`](file:///home/chuucommie/Documents/Projects/CopilotPixel/CopilotPixel/webview-ui/src/office/layout/layoutSerializer.ts#L33)
- **Root Cause:**
  When a character places a coffee mug on a desk, the mug's sort Y coordinate is computed as:
  ```typescript
  const mugZY = mug.row * TILE_SIZE + mug.offsetY;
  ```
  However, large wooden desks have a footprint height of 2 tiles (`height: 2`), and their front rendering edge has `sortY = (desk.row + 2) * TILE_SIZE`.
  Because `mugZY < deskZY`, the renderer draws the mug _first_, and then paints the wooden desk surface _on top of it_.
- **Impact:** Coffee mugs placed on top-half desk tiles disappear underneath the desk graphic.
- **Remediation:** Add `+ TILE_SIZE` to the z-index of props placed on multi-tile furniture surfaces.

---

### Discovered Bug #11: Multi-Terminal Lead Eviction Bug in `officeState.ts`

- **Severity:** Medium (State Wipeout)
- **File & Line:** [`webview-ui/src/office/engine/officeState.ts:2463-2470`](file:///home/chuucommie/Documents/Projects/CopilotPixel/CopilotPixel/webview-ui/src/office/engine/officeState.ts#L2463-L2470)
- **Root Cause:**
  When `ensureSubagentTeam` initializes terminal workers:
  ```typescript
  if (role === 'terminal') {
    const existing = Array.from(this.characters.values()).find((c) => c.role === 'terminal');
    if (existing && existing.id !== charId) {
      this.removeCharacter(existing.id); // Removes existing terminal worker!
    }
  }
  ```
  The logic assumes there is only ever one terminal. If the user opens a second terminal in VS Code or executes concurrent background tasks, spawning the second terminal worker deletes the first one from the office.
- **Impact:** Only one terminal worker can exist; concurrent terminal tasks obliterate existing characters.
- **Remediation:** Key terminal workers by `terminal_${terminalId}` and do not evict other terminal agents unless specifically closed.

---

### Discovered Bug #12: Missing `isSitting` Property in Fallback Break Spot

- **Severity:** Medium (Visual Pose Glitch)
- **File & Line:** [`webview-ui/src/office/engine/officeState.ts:1835-1841, 1875`](file:///home/chuucommie/Documents/Projects/CopilotPixel/CopilotPixel/webview-ui/src/office/engine/officeState.ts#L1835-L1841)
- **Root Cause:**
  In `officeState.ts`:
  ```typescript
  // Fallback spot when breakSpots list is empty:
  return { col: 14, row: 8 }; // Missing isSitting boolean!
  ...
  // In line 1875:
  ch.isSitting = spot.isSitting; // Becomes undefined!
  ```
  When `breakSpots` has no free spots and returns the fallback coordinate, `spot.isSitting` is `undefined`. When character enters `CharacterState.SIT`, `ch.isSitting` is falsy.
- **Impact:** Character is in sitting state logic, but the sprite renders in standing pose on top of the seat.
- **Remediation:** Provide explicit `{ col: 14, row: 8, isSitting: true }`.

---

### Discovered Bug #13: Break Room Wanderer Escapes After Sink Washing

- **Severity:** Low (Behavioral Anomaly)
- **File & Line:** [`webview-ui/src/office/engine/officeState.ts:2833-2843`](file:///home/chuucommie/Documents/Projects/CopilotPixel/CopilotPixel/webview-ui/src/office/engine/officeState.ts#L2833-L2843), [`characters.ts:406`](file:///home/chuucommie/Documents/Projects/CopilotPixel/CopilotPixel/webview-ui/src/office/engine/characters.ts#L406)
- **Root Cause:**
  When an agent finishes washing their coffee mug at the sink, their next step is determined by:
  ```typescript
  ch.state = CharacterState.IDLE;
  this.startIdleWandering(ch.id);
  ```
  `startIdleWandering` chooses any random walkable tile across the entire office map without bounding it to the break room.
- **Impact:** An agent on coffee break suddenly wanders into the middle of the executive boardroom or engineering cluster holding a clean mug, before remembering to walk back.
- **Remediation:** Restrict post-sink wandering to break room bounding boxes when `ch.onBreak === true`.

---

## 6. Actionable Remediation & Modernization Roadmap

1. **Immediate Patch:** Apply fixes for Bugs #1, #2, #3, and #4 in `useExtensionMessages.ts` and `officeState.ts` to ensure subagent speech bubbles, order dialogues, and lifecycle persistence operate cleanly.
2. **Pathfinding Hardening:** Update `findPath` fallback handling so characters gracefully wait or pathfind to the nearest open adjacent tile rather than typing in corridors.
3. **Enterprise Layout Spatial Awareness:** Replace coordinate column heuristics (`col >= 11`) with room boundary polygon queries.
4. **Antigravity Tool Expansion:** Complete the `typeToTool` lookup table in `transcriptParser.ts` for all standard coding assistant tools.
