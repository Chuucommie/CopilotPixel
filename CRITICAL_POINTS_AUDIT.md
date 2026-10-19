# Pixel Office — Comprehensive System Audit & Critical Points Analysis

**Document Status**: Final Audit Report  
**Target Application**: Pixel Office (VS Code Extension & Standalone Engine)  
**Date**: October 16, 2026  
**Audited Subsystems**: Office Simulation Engine, TileMap & Pathfinding, Layout Serializer, 2.5D Canvas Renderer, Autonomous Agent Runner, State Persistence, Brand Identity.

---

## Executive Summary

A comprehensive architectural and functional audit of the Pixel Office codebase was performed across all layers (frontend React/Canvas webview, layout serialization, core simulation state machines, VS Code extension adapters, and backend servers).

While the test suites pass (524 tests) and TypeScript type checks succeed with zero errors, deep-dive static analysis and algorithmic walkthroughs identified **9 critical points and architectural vulnerabilities**. Notably, a subtle bug in BFS pathfinding (`tileMap.ts`) and an unconstrained seat assignment heuristic (`officeState.ts`) cause characters to teleport and occasionally assign lounge couches as active coding workstations.

---

## Matrix of Identified Critical Points

| ID        | Category                 | Severity            | File(s) & Lines                                                                                                                                                                                                                                                                                       | Summary                                                                                                     |
| --------- | ------------------------ | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| **CP-01** | Simulation / Seating     | **CRITICAL / HIGH** | [`officeState.ts:384-412`](file:///home/chuucommie/Documents/Projects/CopilotPixel/CopilotPixel/webview-ui/src/office/engine/officeState.ts#L384-L412), [`officeState.ts:485`](file:///home/chuucommie/Documents/Projects/CopilotPixel/CopilotPixel/webview-ui/src/office/engine/officeState.ts#L485) | Couches and dining chairs in Break Room assigned as coding workstations.                                    |
| **CP-02** | Pathfinding / Navigation | **CRITICAL / HIGH** | [`tileMap.ts:52-58`](file:///home/chuucommie/Documents/Projects/CopilotPixel/CopilotPixel/webview-ui/src/office/layout/tileMap.ts#L52-L58), [`tileMap.ts:94-95`](file:///home/chuucommie/Documents/Projects/CopilotPixel/CopilotPixel/webview-ui/src/office/layout/tileMap.ts#L94-L95)                | Destination chair tiles blocked in BFS, causing pathfinding failure & teleportation.                        |
| **CP-03** | Simulation / State       | **MEDIUM**          | [`officeState.ts:184-205`](file:///home/chuucommie/Documents/Projects/CopilotPixel/CopilotPixel/webview-ui/src/office/engine/officeState.ts#L184-L205)                                                                                                                                                | Layout reload violently rips resting agents from Break Room back to desks while retaining break animations. |
| **CP-04** | Simulation / Animation   | **MEDIUM**          | [`officeState.ts:1601-1616`](file:///home/chuucommie/Documents/Projects/CopilotPixel/CopilotPixel/webview-ui/src/office/engine/officeState.ts#L1601-L1616)                                                                                                                                            | `isCurrentTileInvalid` treats occupied chairs as invalid, instantly teleporting agents on break.            |
| **CP-05** | Graphics / Aesthetics    | **MEDIUM**          | [`paletteUtils.ts:45-51`](file:///home/chuucommie/Documents/Projects/CopilotPixel/CopilotPixel/core/src/paletteUtils.ts#L45-L51)                                                                                                                                                                      | Unconstrained hue rotation (45°–316°) turns skin/hair into green/purple alien tones for agents beyond 6.    |
| **CP-06** | Engine / Concurrency     | **LOW-MEDIUM**      | [`officeState.ts:1309-1320`](file:///home/chuucommie/Documents/Projects/CopilotPixel/CopilotPixel/webview-ui/src/office/engine/officeState.ts#L1309-L1320)                                                                                                                                            | Untracked `setTimeout` in game loop fires dialogues against stale, despawned, or busy agents.               |
| **CP-07** | Rendering / Performance  | **LOW-MEDIUM**      | [`renderer.ts:362-388`](file:///home/chuucommie/Documents/Projects/CopilotPixel/CopilotPixel/webview-ui/src/office/engine/renderer.ts#L362-L388)                                                                                                                                                      | High garbage collection churn from allocating 65+ closure objects every frame at 60 FPS.                    |
| **CP-08** | UX / Branding            | **LOW**             | [`autonomousAgentRunner.ts:154, 500, 519`](file:///home/chuucommie/Documents/Projects/CopilotPixel/CopilotPixel/adapters/vscode/autonomousAgentRunner.ts#L154)                                                                                                                                        | Residual legacy `CopilotPixel:` prefix in user-facing VS Code toasts.                                       |
| **CP-09** | Codebase Hygiene         | **LOW**             | [`normalizeProjectPath.ts`](file:///home/chuucommie/Documents/Projects/CopilotPixel/CopilotPixel/core/src/normalizeProjectPath.ts), [`copilotPixelStore.ts:129`](file:///home/chuucommie/Documents/Projects/CopilotPixel/CopilotPixel/webview-ui/src/office/engine/copilotPixelStore.ts#L129)         | Dead files and unreferenced exports detected by knip.                                                       |

---

## Detailed Critical Points Breakdown

### CP-01: Couches & Dining Chairs in Break Room Mistaken for Coding Desks

- **Location**: [`officeState.ts:384-412`](file:///home/chuucommie/Documents/Projects/CopilotPixel/CopilotPixel/webview-ui/src/office/engine/officeState.ts#L384-L412), [`officeState.ts:485`](file:///home/chuucommie/Documents/Projects/CopilotPixel/CopilotPixel/webview-ui/src/office/engine/officeState.ts#L485), [`seatPlacement.ts:40`](file:///home/chuucommie/Documents/Projects/CopilotPixel/CopilotPixel/webview-ui/src/office/engine/seatPlacement.ts#L40)
- **Root Cause**:
  `layoutToSeats()` categorizes all chairs, benches, and couches as `category === "chairs"`. In `findFreeSeat()`, candidate seats are evaluated. When seats facing PC electronics in Room 1 are exhausted or unzoned, `findFreeSeat` and `closestFreeSeat` fall back to `otherSeats`, which include Break Room couches (`f-b-sofa-f`, `f-b-sofa-b`, `f-b-dchair-1`, etc.).
- **Impact**:
  When workers are assigned to work or start team reasoning (`sitAtWorkstation`), they sit on Break Room couches typing into thin air, leaving actual office desks empty.
- **Remediation**:
  In `findFreeSeat()` and `closestFreeSeat()`, filter out any seats located within the break room boundary:
  ```typescript
  if (this.isBreakRoomArea(seat.seatCol, seat.seatRow)) continue;
  ```

---

### CP-02: `tileMap.findPath` Aborts on Target Chair Footprints

- **Location**: [`tileMap.ts:52-58`](file:///home/chuucommie/Documents/Projects/CopilotPixel/CopilotPixel/webview-ui/src/office/layout/tileMap.ts#L52-L58), [`tileMap.ts:94-95`](file:///home/chuucommie/Documents/Projects/CopilotPixel/CopilotPixel/webview-ui/src/office/layout/tileMap.ts#L94-L95)
- **Root Cause**:
  `getBlockedTiles()` puts all chair footprint tiles into `blockedTiles`. The header of `findPath` notes:
  `// End must be walkable (or be a chair tile which may be adjacent to desk)`
  `// We allow the end tile even if it is not strictly walkable for chair positions`
  However, the subsequent line strictly checks `isWalkable(endCol, endRow, tileMap, blockedTiles)` and returns `[]`. Furthermore, the BFS neighbor expansion skips any neighbor in `blockedTiles`, preventing the search from ever reaching `(endCol, endRow)`.
- **Impact**:
  Characters attempting to pathfind to a chair or sofa fail 100% of the time. This caused previous developers to insert teleportation hacks (`ch.x = seat.seatCol * TILE_SIZE...`) instead of letting agents walk to their seats.
- **Remediation**:
  Allow `endKey` as an exception in the BFS visited/walkable check, or unblock `endKey` before executing `findPath`.

---

### CP-03: Layout Reload Snaps Resting Agents out of Break Room

- **Location**: [`officeState.ts:184-205`](file:///home/chuucommie/Documents/Projects/CopilotPixel/CopilotPixel/webview-ui/src/office/engine/officeState.ts#L184-L205)
- **Root Cause**:
  When `rebuildFromLayout()` runs (on initial load or after layout editor changes), it iterates over all characters and snaps anyone with a valid `ch.seatId` to `(seat.seatCol, seat.seatRow)`. It does not check `ch.isTakingBreak`.
- **Impact**:
  Workers peacefully enjoying coffee, tea, or playing Steam Deck in the break room are violently yanked back to their office desks, while remaining in their break state (e.g. playing Steam Deck while sitting at a desk).
- **Remediation**:
  Skip position snapping for characters currently in break state (`if (ch.isTakingBreak) continue;`).

---

### CP-04: `isCurrentTileInvalid` Bypasses Pathfinding and Teleports Agents

- **Location**: [`officeState.ts:1601-1616`](file:///home/chuucommie/Documents/Projects/CopilotPixel/CopilotPixel/webview-ui/src/office/engine/officeState.ts#L1601-L1616)
- **Root Cause**:
  Line 1601 checks:
  ```typescript
  const isCurrentTileInvalid =
    ch.tileRow < 10 || !isWalkable(ch.tileCol, ch.tileRow, this.tileMap, this.blockedTiles);
  ```
  Since seat tiles are in `blockedTiles`, an agent sitting in their chair evaluates `isWalkable(...) === false`. Consequently, `isCurrentTileInvalid` is always `true`, forcing `path = []` and instantly teleporting the agent into the break room instead of walking.
- **Remediation**:
  Unblock the character current tile (`ch.tileCol, ch.tileRow`) during path calculation.

---

### CP-05: Non-Human Skin and Hair Colors Beyond 6 Agents

- **Location**: [`paletteUtils.ts:45-51`](file:///home/chuucommie/Documents/Projects/CopilotPixel/CopilotPixel/core/src/paletteUtils.ts#L45-L51)
- **Root Cause**:
  ```typescript
  let hueShift = 0;
  if (minCount > 0) {
    hueShift = HUE_SHIFT_MIN_DEG + Math.floor(Math.random() * HUE_SHIFT_RANGE_DEG);
  }
  ```
  When team size exceeds 6 or scaling occurs, `minCount > 0`. Hue shifts up to 316° rotate natural human skin and hair tones into green, purple, and blue alien colors.
- **Remediation**:
  Clamp hue shift or restrict to clothing layers only, or cycle base palettes without hue rotation on skin tones.

---

### CP-06: Untracked `setTimeout` in Dialogue Game Loop

- **Location**: [`officeState.ts:1309-1320`](file:///home/chuucommie/Documents/Projects/CopilotPixel/CopilotPixel/webview-ui/src/office/engine/officeState.ts#L1309-L1320)
- **Root Cause**:
  Break room conversation response dialogue is delayed via raw `setTimeout(..., 2200)`. If the target agent is despawned, assigned a work task, or leaves the room before 2.2 seconds elapse, the callback executes blindly.
- **Remediation**:
  Verify `const target = this.characters.get(b.id); if (target && target.isTakingBreak) ...` inside the callback, and track active timeout handles to cancel on component unmount.

---

### CP-07: Per-Frame Object Allocation Overhead in 2.5D Renderer

- **Location**: [`renderer.ts:362-388`](file:///home/chuucommie/Documents/Projects/CopilotPixel/CopilotPixel/webview-ui/src/office/engine/renderer.ts#L362-L388)
- **Root Cause**:
  `renderScene` allocates an array of closures `{ zY, draw: (c) => ... }` for every piece of furniture, character, and pet on every frame (60 FPS = 3,900+ allocations/sec).
- **Remediation**:
  Use flat drawable structs with reusable render functions and pre-allocated arrays to eliminate GC pressure.

---

### CP-08: Residual Legacy Branding in User-Facing Notifications

- **Location**: [`autonomousAgentRunner.ts:154, 500, 519`](file:///home/chuucommie/Documents/Projects/CopilotPixel/CopilotPixel/adapters/vscode/autonomousAgentRunner.ts#L154)
- **Root Cause**:
  Notifications still use the prefix `CopilotPixel:`:
  ```typescript
  vscode.window.showWarningMessage(`CopilotPixel: ${errorMsg}`);
  ```
- **Remediation**:
  Update to `Pixel Office:`.

---

### CP-09: Knip Dead Code & Orphaned Exports

- **Location**: [`normalizeProjectPath.ts`](file:///home/chuucommie/Documents/Projects/CopilotPixel/CopilotPixel/core/src/normalizeProjectPath.ts), [`copilotPixelStore.ts:129`](file:///home/chuucommie/Documents/Projects/CopilotPixel/CopilotPixel/webview-ui/src/office/engine/copilotPixelStore.ts#L129), [`constants.ts:368-370`](file:///home/chuucommie/Documents/Projects/CopilotPixel/CopilotPixel/webview-ui/src/constants.ts#L368-L370)
- **Root Cause**:
  Refactorings left unused functions (`isSubagentToolName`, `appendTeamDialogue`) and legacy duplicate badge styling constants.
- **Remediation**:
  Remove dead files and unexport internal helper functions.

---

## Action Plan & Roadmap

1. **Phase 1: Seating & Pathfinding Integrity (CP-01, CP-02, CP-04)**
   - Patch `officeState.findFreeSeat` to enforce `!this.isBreakRoomArea(seat.seatCol, seat.seatRow)`.
   - Update `tileMap.findPath` to unblock destination chair tiles during BFS navigation.
   - Smooth agent transitions from chairs to break spots with natural walking animations.

2. **Phase 2: Simulation State & Visual Polish (CP-03, CP-05, CP-06)**
   - Protect resting agents during `rebuildFromLayout`.
   - Fix `paletteUtils` to prevent unnatural alien skin tones.
   - Guard dialogue timers against stale/despawned entities.

3. **Phase 3: Cleanliness & Branding (CP-07, CP-08, CP-09)**
   - Eliminate GC churn in `renderer.ts`.
   - Update notifications to `Pixel Office:`.
   - Clean dead exports flagged by Knip.
