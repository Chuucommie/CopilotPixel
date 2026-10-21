# Implementation Plan: Pixel Office Simulation & Flow Bug Fixes

**Document:** `plan.md`  
**Target Version:** CopilotPixel v1.4.10  
**Date:** 2026-10-21  
**Status:** Ready for Implementation  
**Derived from:** [`research.md`](file:///home/chuucommie/Documents/Projects/CopilotPixel/CopilotPixel/research.md)

---

## 1. Executive Summary & Scope

During the comprehensive analysis of CopilotPixel, **13 bugs** were discovered across the event pipeline, simulation state machine, pathfinding, seat allocation, routine scheduler, and rendering engine. These bugs cause speech bubble misattributions, orphaned characters, premature cancellation of autonomous tasks, infinite walking loops, mid-air typing animations, and hidden coffee props.

This plan details the exact architectural refactoring and code changes required to eliminate all 13 issues safely and systematically without introducing regressions.

### Target Files for Modification

1. [`webview-ui/src/hooks/useExtensionMessages.ts`](file:///home/chuucommie/Documents/Projects/CopilotPixel/CopilotPixel/webview-ui/src/hooks/useExtensionMessages.ts) (Issues 1, 2, 3, 4)
2. [`webview-ui/src/office/engine/officeState.ts`](file:///home/chuucommie/Documents/Projects/CopilotPixel/CopilotPixel/webview-ui/src/office/engine/officeState.ts) (Issues 4, 5, 6, 7, 8, 11, 12, 13)
3. [`webview-ui/src/office/engine/routineManager.ts`](file:///home/chuucommie/Documents/Projects/CopilotPixel/CopilotPixel/webview-ui/src/office/engine/routineManager.ts) (Issue 7)
4. [`server/src/transcriptParser.ts`](file:///home/chuucommie/Documents/Projects/CopilotPixel/CopilotPixel/server/src/transcriptParser.ts) (Issue 9)
5. [`webview-ui/src/office/engine/renderer.ts`](file:///home/chuucommie/Documents/Projects/CopilotPixel/CopilotPixel/webview-ui/src/office/engine/renderer.ts) (Issue 10)
6. [`webview-ui/test/simulationBugs.test.ts`](file:///home/chuucommie/Documents/Projects/CopilotPixel/CopilotPixel/webview-ui/test/simulationBugs.test.ts) (New test suite covering regressions)

---

## 2. Master Execution Checklist & Actionable TODO List

Below is the complete, phased task breakdown for implementing and verifying the fixes for all 13 discovered bugs. Each task specifies target files, line numbers, dependencies, and clear acceptance criteria.

---

### Phase 0: Baseline Verification & Environment Sanity

- [x] **Task 0.1: Run Baseline Server Test Suite**
  - **Command:** `npm run test`
  - **Prerequisites:** None
  - **Target:** Verify all 27 server test files (403 tests) pass cleanly before any code edits.
  - **Acceptance Criteria:** 0 failed tests, exit code 0.
- [x] **Task 0.2: Run Baseline Webview Test Suite**
  - **Command:** `npm run test:webview`
  - **Prerequisites:** None
  - **Target:** Verify all 18 webview test files (130 tests) pass cleanly before any code edits.
  - **Acceptance Criteria:** 0 failed tests, exit code 0.
- [x] **Task 0.3: Run Baseline TypeScript Typecheck**
  - **Command:** `npm run check-types`
  - **Prerequisites:** None
  - **Target:** Validate that both root and `webview-ui` TypeScript configurations yield 0 errors.
  - **Acceptance Criteria:** Clean output with 0 diagnostic errors.

---

### Phase 1: Wire Protocol & Event Hook Ingestion (`useExtensionMessages.ts`)

- [x] **Task 1.1: Fix `agentToolStart` Target Character Resolution (Issue 1)**
  - **File:** [`webview-ui/src/hooks/useExtensionMessages.ts`](file:///home/chuucommie/Documents/Projects/CopilotPixel/CopilotPixel/webview-ui/src/hooks/useExtensionMessages.ts#L516-L523) (lines 516–522)
  - **Action:** Fall back from `(msg as any).agentId` to `(msg as any).id ?? 'main'`.
  - **Acceptance Criteria:** Subagents and terminal workers display tool execution bubbles over their own character sprites instead of misattributing them to `'main'`.
- [x] **Task 1.2: Fix Premature Order Nullification in `agentToolDone` (Issue 3)**
  - **File:** [`webview-ui/src/hooks/useExtensionMessages.ts`](file:///home/chuucommie/Documents/Projects/CopilotPixel/CopilotPixel/webview-ui/src/hooks/useExtensionMessages.ts#L674-L689) (lines 674–688)
  - **Action:** Cache `subCh.currentOrder` before nulling it; interpolate cached text into dialogue.
  - **Acceptance Criteria:** Team dialogue correctly announces `Completed "Directive Name"!` instead of defaulting to generic `Completed subtask!`.
- [x] **Task 1.3: Fix `subagentClear` vs `agentToolDone` Lifecycle Race Condition (Issue 2)**
  - **File:** [`webview-ui/src/hooks/useExtensionMessages.ts`](file:///home/chuucommie/Documents/Projects/CopilotPixel/CopilotPixel/webview-ui/src/hooks/useExtensionMessages.ts#L690-L926) (lines 690, 925–950)
  - **Action:** Defer deletion from `os.subagentIdMap` until `subagentClear` finishes its dialogue processing and character state transitions.
  - **Acceptance Criteria:** `os.getSubagentId(id, parentToolId)` successfully resolves in `subagentClear`, triggering lead-worker wrap-up dialogues and lounge break routing.
- [x] **Task 1.4: Guard `agentToolsClear` Against Killing Autonomous & Background Tasks (Issue 4)**
  - **File:** [`webview-ui/src/hooks/useExtensionMessages.ts`](file:///home/chuucommie/Documents/Projects/CopilotPixel/CopilotPixel/webview-ui/src/hooks/useExtensionMessages.ts#L724-L734) (lines 724–734)
  - **Action:** Check `!bgSet?.has(meta.parentToolId)` and `!(subCh.currentOrder && subCh.orderStatus === 'running')` before calling `os.setAgentActive(subId, false)` and `os.startAgentBreak(subId)`.
  - **Acceptance Criteria:** Editor tools clearing on turn completion does not interrupt running autonomous background workers.
- [x] **Task 1.5: Verify Phase 1 Changes**
  - **Command:** `npm run check-types && npm run test:webview`
  - **Acceptance Criteria:** Typecheck passes; all existing webview tests pass.

---

### Phase 2: Simulation Brain & Seating Integrity (`officeState.ts`)

- [x] **Task 2.1: Implement Atomic Seat Reassignment in `reassignSeat` (Issue 5)**
  - **File:** [`webview-ui/src/office/engine/officeState.ts`](file:///home/chuucommie/Documents/Projects/CopilotPixel/CopilotPixel/webview-ui/src/office/engine/officeState.ts#L650-L663) (lines 650–662)
  - **Action:** Validate `targetSeat` existence and availability _before_ freeing `ch.seatId`.
  - **Acceptance Criteria:** Attempting to reassign an agent to an occupied or invalid seat fails gracefully without deallocating the agent's current seat.
- [x] **Task 2.2: Implement Safe Seat Pathfinding Fallback (Issue 8)**
  - **File:** [`webview-ui/src/office/engine/officeState.ts`](file:///home/chuucommie/Documents/Projects/CopilotPixel/CopilotPixel/webview-ui/src/office/engine/officeState.ts#L733-L743) (lines 733–742)
  - **Action:** In `returnAgentFromBreak`, only enter `CharacterState.TYPE` if `ch.tileCol === seat.seatCol && ch.tileRow === seat.seatRow`. If path is blocked, enter `CharacterState.THINK` with a retry delay.
  - **Acceptance Criteria:** Characters never oscillate typing hands or spawn code particles in corridors or mid-air when their desk path is blocked.
- [x] **Task 2.3: Refine Break Room Spatial Detection in `isBreakRoomArea` (Issue 6)**
  - **File:** [`webview-ui/src/office/engine/officeState.ts`](file:///home/chuucommie/Documents/Projects/CopilotPixel/CopilotPixel/webview-ui/src/office/engine/officeState.ts#L1979-L1987) (lines 1979–1987)
  - **Action:** Ensure tiles containing workstation desks or assigned non-lounge seats are excluded from break room classification. Remove overly broad column slicing.
  - **Acceptance Criteria:** Working desks in large enterprise presets are not misclassified as break room lounge spots.
- [x] **Task 2.4: Prevent Multi-Terminal Lead Eviction in `ensureSubagentTeam` (Issue 11)**
  - **File:** [`webview-ui/src/office/engine/officeState.ts`](file:///home/chuucommie/Documents/Projects/CopilotPixel/CopilotPixel/webview-ui/src/office/engine/officeState.ts#L2460-L2475) (lines 2460–2475)
  - **Action:** Check `if (ch.isTeamLead)` instead of `if (!ch.isSubagent)` when removing stale leads.
  - **Acceptance Criteria:** Spawning a second terminal or worker does not delete existing independent terminal characters from the office.
- [x] **Task 2.5: Add Missing `isSitting` to Break Fallback Spot (Issue 12)**
  - **File:** [`webview-ui/src/office/engine/officeState.ts`](file:///home/chuucommie/Documents/Projects/CopilotPixel/CopilotPixel/webview-ui/src/office/engine/officeState.ts#L1835-L1841) (lines 1835–1841)
  - **Action:** Add `isSitting: true` to the fallback break spot object in `restoreAgentsFromSnapshot`.
  - **Acceptance Criteria:** Character sprites render in proper sitting pose rather than standing on top of break seats when restored with empty spot caches.
- [x] **Task 2.6: Route Agents Back to Workstation/Lounge After Sink Washing (Issue 13)**
  - **File:** [`webview-ui/src/office/engine/officeState.ts`](file:///home/chuucommie/Documents/Projects/CopilotPixel/CopilotPixel/webview-ui/src/office/engine/officeState.ts#L2833-L2845) (lines 2833–2845)
  - **Action:** After mug washing completes, pathfind back to `ch.seatId` if not on break, or invoke `startAgentBreak()` if on break.
  - **Acceptance Criteria:** Characters do not get stranded at the kitchen sink or wander uncontrollably into other rooms after washing cups.
- [x] **Task 2.7: Support Explicit Break Spot in `startAgentBreak` (Issue 7 Part 1)**
  - **File:** [`webview-ui/src/office/engine/officeState.ts`](file:///home/chuucommie/Documents/Projects/CopilotPixel/CopilotPixel/webview-ui/src/office/engine/officeState.ts#L1640-L1675) (lines 1640–1675)
  - **Action:** Add optional `explicitSpot?: BreakSpot` parameter to `startAgentBreak`. If character is already at this spot, return early without repathing.
  - **Acceptance Criteria:** Calling `startAgentBreak` with an explicit spot anchors the character directly to that spot without random re-selection.
- [x] **Task 2.8: Verify Phase 2 Changes**
  - **Command:** `npm run check-types && npm run test:webview`
  - **Acceptance Criteria:** All simulation functions typecheck cleanly and existing tests pass.

---

### Phase 3: Radiant Routine Engine Stabilization (`routineManager.ts`)

- [x] **Task 3.1: Pass Explicit Spot to Avoid Routine Repath Loop (Issue 7 Part 2)**
  - **File:** [`webview-ui/src/office/engine/routineManager.ts`](file:///home/chuucommie/Documents/Projects/CopilotPixel/CopilotPixel/webview-ui/src/office/engine/routineManager.ts#L426-L436) (lines 426–436)
  - **Action:** Pass `chosenSpot` into `os.startAgentBreak(ch.id, routine.breakType || chosenSpot.breakType, chosenSpot)`. Check if already at `chosenSpot` before initiating break.
  - **Acceptance Criteria:** Agents resting in lounge or gaming areas stay in place instead of walking between chairs every 18 seconds.
- [x] **Task 3.2: Verify Phase 3 Changes**
  - **Command:** `npm run check-types && npm run test:webview`
  - **Acceptance Criteria:** Routine manager compiles with 0 errors and passes tests.

---

### Phase 4: Server Transcript Parser Modernization (`transcriptParser.ts`)

- [x] **Task 4.1: Expand Antigravity Tool Result Mappings (Issue 9)**
  - **File:** [`server/src/transcriptParser.ts`](file:///home/chuucommie/Documents/Projects/CopilotPixel/CopilotPixel/server/src/transcriptParser.ts#L883-L925) (lines 883–925)
  - **Action:** Add `VIEW_FILE`, `WRITE_TO_FILE`, `REPLACE_FILE_CONTENT`, `MULTI_REPLACE_FILE_CONTENT`, `GREP_SEARCH`, `LIST_DIR`, and `INVOKE_SUBAGENT` to `typeToTool` and the `record.type` condition.
  - **Acceptance Criteria:** Antigravity filesystem and subagent tool invocations immediately complete with `agentToolDone` when results are parsed, rather than waiting for end-of-turn text.
- [x] **Task 4.2: Verify Phase 4 Changes**
  - **Command:** `npm run test`
  - **Acceptance Criteria:** All 27 server test suites pass cleanly.

---

### Phase 5: Canvas Renderer Depth & Z-Sorting (`renderer.ts`)

- [x] **Task 5.1: Correct Placed Coffee Mug Z-Sorting on Desks (Issue 10)**
  - **File:** [`webview-ui/src/office/engine/renderer.ts`](file:///home/chuucommie/Documents/Projects/CopilotPixel/CopilotPixel/webview-ui/src/office/engine/renderer.ts#L677-L685) (lines 677–685)
  - **Action:** Adjust `cupZY` calculation so mugs placed on multi-tile desks sort in front of the desk surface (`(pc.row + 1) * TILE_SIZE + offsetY + 2`).
  - **Acceptance Criteria:** Coffee mugs placed on wooden desks render visually on top of the desk graphic rather than underneath it.
- [x] **Task 5.2: Verify Phase 5 Changes**
  - **Command:** `npm run check-types && npm run test:webview`
  - **Acceptance Criteria:** Renderer compiles without errors and tests pass.

---

### Phase 6: Dedicated Regression Test Suite (`simulationBugs.test.ts`)

- [x] **Task 6.1: Create Test Suite File `webview-ui/test/simulationBugs.test.ts`**
  - **Action:** Scaffold test file with mock office layout, character factory, and seat configurations.
- [x] **Task 6.2: Add Test Case: Atomic Seat Reassignment**
  - **Action:** Assert that attempting to reassign an agent to an occupied seat keeps their original seat intact.
- [x] **Task 6.3: Add Test Case: Autonomous Task Immunity in `agentToolsClear`**
  - **Action:** Assert that characters with `orderStatus === 'running'` or background tools are not forced onto break or cancelled by tool clearance events.
- [x] **Task 6.4: Add Test Case: Explicit Break Spot Anchoring**
  - **Action:** Assert that `startAgentBreak` with `explicitSpot` targets the exact spot provided and does not repath when already positioned.
- [x] **Task 6.5: Add Test Case: Seat Return Path Obstruction Fallback**
  - **Action:** Assert that when pathfinding to seat returns `[]` from a distance, character enters `CharacterState.THINK` and never `CharacterState.TYPE`.
- [x] **Task 6.6: Add Test Case: Break Fallback Spot Sitting Pose**
  - **Action:** Assert that `restoreAgentsFromSnapshot` produces `isSitting: true` on fallback spots.
- [x] **Task 6.7: Add Test Case: Sink Washing Navigation Return**
  - **Action:** Assert that completing sink washing sets up a path back to the assigned workstation seat.
- [x] **Task 6.8: Execute and Validate Regression Suite**
  - **Command:** `npx vitest run test/simulationBugs.test.ts` (inside `webview-ui`)
  - **Acceptance Criteria:** All test cases pass 100%.

---

### Phase 7: End-to-End Verification & Final Review

- [x] **Task 7.1: Full Workspace Test Pass**
  - **Command:** `npm run test && npm run test:webview`
  - **Acceptance Criteria:** All server (403+) and webview (135+) tests pass with 0 failures.
- [x] **Task 7.2: Full Workspace Typecheck**
  - **Command:** `npm run check-types`
  - **Acceptance Criteria:** 0 TypeScript compiler errors.
- [x] **Task 7.3: Update `plan.md` Checklist**
  - **Action:** Check off all completed tasks in `plan.md`.
- [x] **Task 7.4: Git Status & Session Backup Synchronization**
  - **Action:** Verify git working tree status and record final completion in `backup chat/sessions/`.

---

## 3. Implementation Specifications by Component

---

### Phase 1: Wire Protocol & Event Hook Fixes (`useExtensionMessages.ts`)

#### Issue 1: `agentToolStart` Target Character Resolution

- **Problem:** [`useExtensionMessages.ts:517`](file:///home/chuucommie/Documents/Projects/CopilotPixel/CopilotPixel/webview-ui/src/hooks/useExtensionMessages.ts#L517) reads `msg.agentId`. The wire contract [`extension.ts:133`](file:///home/chuucommie/Documents/Projects/CopilotPixel/CopilotPixel/webview-ui/src/types/extension.ts#L133) passes `id` (the agent ID). `msg.agentId` is `undefined`, so `os.characters.get(undefined)` fails, causing all subagent/terminal tool bubbles to be incorrectly attached to the `'main'` lead agent.
- **Code Change:**

```typescript
// webview-ui/src/hooks/useExtensionMessages.ts (around line 516)
-        } else {
-          const activeChar = os.characters.get(msg.agentId);
-          if (activeChar) {
-            activeChar.speechBubbleText = displayLabel;
-            activeChar.speechBubbleTimer = 5.0;
-          }
-        }
+        } else {
+          const targetAgentId = (msg as any).agentId ?? (msg as any).id;
+          const activeChar = targetAgentId !== undefined ? os.characters.get(targetAgentId) : null;
+          if (activeChar) {
+            activeChar.speechBubbleText = displayLabel;
+            activeChar.speechBubbleTimer = 5.0;
+          }
+        }
```

---

#### Issue 2: Subagent Lifecycle Race Condition (`subagentClear` vs `agentToolDone`)

- **Problem:** In [`useExtensionMessages.ts:690`](file:///home/chuucommie/Documents/Projects/CopilotPixel/CopilotPixel/webview-ui/src/hooks/useExtensionMessages.ts#L690), `os.subagentIdMap.delete(`${id}:${toolId}`)` immediately deletes the key in `agentToolDone`. When `subagentClear` arrives right after, line 925 `os.getSubagentId(id, parentToolId)` returns `null`. This drops the completion dialogue and team interaction between worker and lead.
- **Code Change:**
  Keep the mapping in `subagentIdMap` until `subagentClear` is processed, or only delete it in `subagentClear`.

```typescript
// In agentToolDone (around line 690):
-          os.subagentIdMap.delete(`${id}:${toolId}`);
+          // Retain subagentIdMap entry until subagentClear processes the completion dialogue,
+          // or schedule deletion if subagentClear does not fire.

// In subagentClear (around line 925):
          const subId = os.getSubagentId(id, parentToolId);
          const subCh = subId !== null ? os.characters.get(subId) : null;
          const leadCh = os.characters.get(id);
          if (subCh) {
            ...
          }
+         // Clean up mapping after subagentClear finishes dialogue
+         os.subagentIdMap.delete(`${id}:${parentToolId}`);
```

---

#### Issue 3: Premature Order Nullification in `agentToolDone`

- **Problem:** Line 676 sets `subCh.currentOrder = null;`. Line 686 then checks `subCh.currentOrder ? ...`, which is always false, forcing dialogue text to display generic `"Completed subtask!"`.
- **Code Change:**

```typescript
// webview-ui/src/hooks/useExtensionMessages.ts (around line 674)
           const subCh = os.characters.get(subId);
           if (subCh) {
+            const completedOrderText = subCh.currentOrder;
             os.setAgentTool(subId, null);
             os.setAgentActive(subId, false);
             subCh.currentOrder = null;
             subCh.role = 'Teammate';
             os.startAgentBreak(subId);
             os.addTeamDialogue({
               fromAgentId: subId,
               fromName: subCh.customName || `Worker #${subId}`,
               fromRole: 'Teammate',
               toAgentId: id,
               toName: os.characters.get(id)?.customName || 'Project Lead',
               toRole: 'Lead',
-              text: `Completed ${subCh.currentOrder ? `"${subCh.currentOrder}"` : 'subtask'}. Returning to lounge for a break!`,
+              text: `Completed ${completedOrderText ? `"${completedOrderText}"` : 'subtask'}. Returning to lounge for a break!`,
               context: 'break_room',
             });
           }
```

---

#### Issue 4: Prevent `agentToolsClear` from Interrupting Autonomous Workers & Background Tasks

- **Problem:** [`useExtensionMessages.ts:724-734`](file:///home/chuucommie/Documents/Projects/CopilotPixel/CopilotPixel/webview-ui/src/hooks/useExtensionMessages.ts#L724-L734) loops over all `os.subagentMeta.entries()` and forces characters onto break, clearing their tools. It completely ignores `bgSet` (background tools) and whether an autonomous worker is actively running an order (`subCh.orderStatus === 'running'`).
- **Code Change:**

```typescript
// webview-ui/src/hooks/useExtensionMessages.ts (around line 724)
         for (const [subId, meta] of os.subagentMeta.entries()) {
           if (meta.parentAgentId === id) {
             const subCh = os.characters.get(subId);
-            if (subCh && !subCh.isTakingBreak) {
+            const isBackgroundTool = bgSet?.has(meta.parentToolId);
+            const isRunningAutonomous = subCh?.currentOrder && subCh?.orderStatus === 'running';
+            if (subCh && !subCh.isTakingBreak && !isBackgroundTool && !isRunningAutonomous) {
               subCh.role = 'Teammate';
               os.setAgentActive(subId, false);
               os.setAgentTool(subId, null);
               os.startAgentBreak(subId);
             }
           }
         }
```

---

### Phase 2: Simulation Brain & Seating Fixes (`officeState.ts`)

#### Issue 5: Atomic Seat Reassignment

- **Problem:** [`officeState.ts:654-660`](file:///home/chuucommie/Documents/Projects/CopilotPixel/CopilotPixel/webview-ui/src/office/engine/officeState.ts#L654-L660) frees the old seat before checking if `newSeatId` exists or is already assigned. If target is occupied, it exits early, leaving the agent homeless with an unassigned old seat.
- **Code Change:**

```typescript
// webview-ui/src/office/engine/officeState.ts (around line 650)
   reassignSeat(agentId: number, seatId: string): void {
     const ch = this.characters.get(agentId);
     if (!ch) return;
+    // Validate new seat BEFORE touching old seat
+    const seat = this.seats.get(seatId);
+    if (!seat || seat.assigned) return;
+
     // Unassign old seat
     if (ch.seatId) {
       const old = this.seats.get(ch.seatId);
       if (old) old.assigned = false;
     }
-    // Assign new seat
-    const seat = this.seats.get(seatId);
-    if (!seat || seat.assigned) return;
     seat.assigned = true;
     ch.seatId = seatId;
```

---

#### Issue 6: Spatial Break Room Boundary Detection

- **Problem:** [`officeState.ts:1979-1987`](file:///home/chuucommie/Documents/Projects/CopilotPixel/CopilotPixel/webview-ui/src/office/engine/officeState.ts#L1979-L1987) uses `if (this.layout.cols >= 18 && col >= 11) return true;`. In enterprise layouts (30x20), columns 11-18 in lower rows contain working engineering desks. They are misclassified as break room lounges.
- **Code Change:**
  Refine `isBreakRoomArea` so that tiles occupied by work desks or chairs with desk pairings are never flagged as break rooms:

```typescript
// webview-ui/src/office/engine/officeState.ts (around line 1979)
   isBreakRoomArea(col: number, row: number): boolean {
     if (row < 10) return false;
+    // Ensure this tile is not an assigned workstation desk/chair
+    const seatKey = `${col},${row}`;
+    const seat = this.seats.get(seatKey);
+    if (seat && seat.facingDir !== undefined) {
+      // If seat has a dedicated workstation desk adjacent to it, it is not the break room
+      const isWorkstation = Array.from(this.seats.values()).some(
+        (s) => s.seatCol === col && s.seatRow === row && !s.isLounge
+      );
+      if (isWorkstation) return false;
+    }
     if (this.layout.cols >= 18 && col >= 11) return true;
     if (this.tileMap && this.tileMap[row] && this.tileMap[row][col] !== undefined) {
       const tile = this.tileMap[row][col];
-      if (tile === 1 || tile === 9) return true;
+      if (tile === 9) return true; // Tile 9 is lounge/carpet, tile 1 is standard floor
     }
     return col >= Math.floor(this.layout.cols / 2);
   }
```

---

#### Issue 7: Routine Manager Infinite Walking Loop

- **Problem:** In [`routineManager.ts:433`](file:///home/chuucommie/Documents/Projects/CopilotPixel/CopilotPixel/webview-ui/src/office/engine/routineManager.ts#L433), `os.startAgentBreak(ch.id, routine.breakType || chosenSpot.breakType)` is called with only a string type. [`officeState.ts:1652-1660`](file:///home/chuucommie/Documents/Projects/CopilotPixel/CopilotPixel/webview-ui/src/office/engine/officeState.ts#L1652-L1660) then picks a _random_ spot from `matchingSpots`. Every 18 seconds, the agent picks a different random sofa and walks again indefinitely.
- **Code Change:**
  Allow `startAgentBreak` to accept an explicit `targetSpot?: BreakSpot` parameter:

```typescript
// webview-ui/src/office/engine/officeState.ts (around line 1640)
-  startAgentBreak(agentId: number, breakType?: 'coffee' | 'tea' | 'snack' | 'steamdeck'): void {
+  startAgentBreak(
+    agentId: number,
+    breakType?: 'coffee' | 'tea' | 'snack' | 'steamdeck',
+    explicitSpot?: BreakSpot,
+  ): void {
     const ch = this.characters.get(agentId);
     if (!ch) return;

     // If already seated/resting at the target spot, do nothing
+    if (explicitSpot && ch.tileCol === explicitSpot.col && ch.tileRow === explicitSpot.row && ch.isTakingBreak) {
+      return;
+    }
...
-    let targetTile: BreakSpot | null = null;
+    let targetTile: BreakSpot | null = explicitSpot || null;
+    if (!targetTile) {
       const breakSpots = this.getBreakRoomSpots();
       const matchingSpots = breakSpots.filter((s) => s.breakType === chosenType);
       if (matchingSpots.length > 0) {
         targetTile = matchingSpots[Math.floor(Math.random() * matchingSpots.length)];
       } else if (breakSpots.length > 0) {
         targetTile = breakSpots[Math.floor(Math.random() * breakSpots.length)];
       }
+    }
```

And in `routineManager.ts`:

```typescript
// webview-ui/src/office/engine/routineManager.ts (around line 426)
         if (chosenSpot) {
-          if (
-            !ch.isTakingBreak ||
-            ch.breakTargetCol !== chosenSpot.col ||
-            ch.breakTargetRow !== chosenSpot.row
-          ) {
-            os.startAgentBreak(ch.id, routine.breakType || chosenSpot.breakType);
-          }
+          const isAtSpot = ch.tileCol === chosenSpot.col && ch.tileRow === chosenSpot.row;
+          if (!ch.isTakingBreak || !isAtSpot) {
+            os.startAgentBreak(ch.id, routine.breakType || chosenSpot.breakType, chosenSpot);
+          }
         }
```

---

#### Issue 8: BFS Pathfinding Failure Leaves Characters Typing in Mid-Air

- **Problem:** [`officeState.ts:734-738`](file:///home/chuucommie/Documents/Projects/CopilotPixel/CopilotPixel/webview-ui/src/office/engine/officeState.ts#L734-L738) assumes `if (path.length === 0)` means "Already at seat" and sets `ch.state = CharacterState.TYPE`. If pathfinding fails (path temporarily obstructed), the character starts typing in the middle of a hallway or doorway.
- **Code Change:**

```typescript
// webview-ui/src/office/engine/officeState.ts (around line 727)
     if (path.length > 0) {
       ch.path = path;
       ch.moveProgress = 0;
       ch.state = CharacterState.WALK;
       ch.frame = 0;
       ch.frameTimer = 0;
-    } else {
+    } else if (ch.tileCol === seat.seatCol && ch.tileRow === seat.seatRow) {
       // Truly already at seat — sit down
       ch.state = CharacterState.TYPE;
       ch.dir = seat.facingDir;
       ch.frame = 0;
       ch.frameTimer = 0;
       if (!ch.isActive) {
         ch.seatTimer = INACTIVE_SEAT_TIMER_MIN_SEC + Math.random() * INACTIVE_SEAT_TIMER_RANGE_SEC;
       }
+    } else {
+      // Path temporarily blocked — remain IDLE/THINK and retry on next tick instead of typing in mid-air
+      ch.state = CharacterState.THINK;
+      ch.seatTimer = 2.0;
+    }
```

---

#### Issue 11: Multi-Terminal Lead Eviction Bug

- **Problem:** [`officeState.ts:2460-2475`](file:///home/chuucommie/Documents/Projects/CopilotPixel/CopilotPixel/webview-ui/src/office/engine/officeState.ts#L2460-L2475) in `ensureSubagentTeam` checks `if (!ch.isSubagent) ... this.characters.delete(id);`. This deletes all non-subagent characters (including other active terminal workers and autonomous agents) whenever a new team lead or terminal is initialized.
- **Code Change:**
  Only evict or demote characters that were previously designated as `isTeamLead`:

```typescript
// webview-ui/src/office/engine/officeState.ts (around line 2461)
     for (const [id, ch] of this.characters.entries()) {
       if (id !== leadId) {
-        if (!ch.isSubagent) {
+        if (ch.isTeamLead) {
+          // Only demote or remove previous leads, not independent terminal workers or autonomous agents
           if (ch.seatId) {
             const seat = this.seats.get(ch.seatId);
             if (seat) seat.assigned = false;
           }
           this.characters.delete(id);
           removeCopilotPixelAgent(id);
         } else {
           ch.isTeamLead = false;
           if (ch.role === 'Lead') {
             ch.role = 'Teammate';
           }
         }
       }
     }
```

---

#### Issue 12: Missing `isSitting` in Break Fallback Spot

- **Problem:** [`officeState.ts:1835-1841`](file:///home/chuucommie/Documents/Projects/CopilotPixel/CopilotPixel/webview-ui/src/office/engine/officeState.ts#L1835-L1841) omits `isSitting` from the fallback spot object. In line 1875, `ch.isSitting = spot.isSitting` sets `ch.isSitting = undefined`, rendering characters standing upright while in break sitting state.
- **Code Change:**

```typescript
// webview-ui/src/office/engine/officeState.ts (around line 1835)
       const spot = breakSpots[restoredIds.length % breakSpots.length] || {
         col: 17,
         row: 14,
         breakType: 'coffee' as const,
         state: CharacterState.BREAK_COFFEE,
         dir: Direction.DOWN,
+        isSitting: true,
       };
```

---

#### Issue 13: Automatic Return to Workstation / Lounge After Mug Washing

- **Problem:** [`officeState.ts:2833-2843`](file:///home/chuucommie/Documents/Projects/CopilotPixel/CopilotPixel/webview-ui/src/office/engine/officeState.ts#L2833-L2843) resets `ch.kitchenAction = null` after sink washing, leaving the character standing at the kitchen sink tile with no follow-up path.
- **Code Change:**
  Route the agent back to their desk (if working) or to the lounge (if taking a break):

```typescript
// webview-ui/src/office/engine/officeState.ts (around line 2835)
             ch.kitchenAction = null;
             ch.kitchenActionTimer = 0;
             this.addTeamDialogue({
               fromAgentId: ch.id,
               fromName: ch.customName || `Agent #${ch.id}`,
               fromRole: ch.role || 'Teammate',
               text: 'Mug washed and put back in the kitchen! 🚰✨',
               context: 'break_room',
             });
+            // Return to assigned seat if not on break, or transition back to break spot
+            if (!ch.isTakingBreak && ch.seatId) {
+              const seat = this.seats.get(ch.seatId);
+              if (seat) {
+                const returnPath = this.withOwnSeatUnblocked(ch, () =>
+                  findPath(ch.tileCol, ch.tileRow, seat.seatCol, seat.seatRow, this.tileMap, this.blockedTiles),
+                );
+                if (returnPath.length > 0) {
+                  ch.path = returnPath;
+                  ch.moveProgress = 0;
+                  ch.state = CharacterState.WALK;
+                  ch.isSitting = false;
+                }
+              }
+            } else if (ch.isTakingBreak) {
+              this.startAgentBreak(ch.id);
+            }
```

---

### Phase 3: Server Transcript Parser Fixes (`transcriptParser.ts`)

#### Issue 9: Expand Antigravity Tool Result Mappings

- **Problem:** [`transcriptParser.ts:883-925`](file:///home/chuucommie/Documents/Projects/CopilotPixel/CopilotPixel/server/src/transcriptParser.ts#L883-L925) only maps `RUN_COMMAND`, `SEARCH_WEB`, `BROWSER_SUBAGENT`, `READ_URL_CONTENT`, and `ASK_QUESTION`. Key Antigravity editing and filesystem tools (`view_file`, `write_to_file`, `replace_file_content`, `multi_replace_file_content`, `grep_search`, `list_dir`) are missing.
- **Code Change:**

```typescript
// server/src/transcriptParser.ts (around line 883)
   // 3. Tool results (RUN_COMMAND, SEARCH_WEB, BROWSER_SUBAGENT, etc.)
   if (
     record.source === 'MODEL' &&
     (record.type === 'RUN_COMMAND' ||
       record.type === 'SEARCH_WEB' ||
       record.type === 'BROWSER_SUBAGENT' ||
       record.type === 'READ_URL_CONTENT' ||
       record.type === 'ASK_QUESTION' ||
+      record.type === 'VIEW_FILE' ||
+      record.type === 'WRITE_TO_FILE' ||
+      record.type === 'REPLACE_FILE_CONTENT' ||
+      record.type === 'MULTI_REPLACE_FILE_CONTENT' ||
+      record.type === 'GREP_SEARCH' ||
+      record.type === 'LIST_DIR' ||
+      record.type === 'INVOKE_SUBAGENT' ||
       record.type === 'GENERIC')
   ) {
     const typeToTool: Record<string, string> = {
       RUN_COMMAND: 'run_command',
       SEARCH_WEB: 'search_web',
       BROWSER_SUBAGENT: 'browser_subagent',
       READ_URL_CONTENT: 'read_url_content',
       ASK_QUESTION: 'ask_question',
+      VIEW_FILE: 'view_file',
+      WRITE_TO_FILE: 'write_to_file',
+      REPLACE_FILE_CONTENT: 'replace_file_content',
+      MULTI_REPLACE_FILE_CONTENT: 'multi_replace_file_content',
+      GREP_SEARCH: 'grep_search',
+      LIST_DIR: 'list_dir',
+      INVOKE_SUBAGENT: 'invoke_subagent',
     };
```

---

### Phase 4: Canvas Renderer Z-Sorting Fixes (`renderer.ts`)

#### Issue 10: Placed Coffee Mug Z-Sorting on Desks

- **Problem:** [`renderer.ts:679`](file:///home/chuucommie/Documents/Projects/CopilotPixel/CopilotPixel/webview-ui/src/office/engine/renderer.ts#L679) computes `cupZY = pc.row * TILE_SIZE + (pc.pixelOffsetY ?? 8) + 1`. Desks with height 2 have `deskZY = (item.row + 2) * TILE_SIZE`. Because `cupZY < deskZY`, the desk is rendered on top of the cup, obscuring it.
- **Code Change:**
  Elevate the cup's z-sort key so it sorts in front of the furniture piece it rests upon:

```typescript
// webview-ui/src/office/engine/renderer.ts (around line 677)
       const cupX = Math.round(offsetX + (pc.col * TILE_SIZE + (pc.pixelOffsetX ?? 8)) * zoom);
       const cupY = Math.round(offsetY + (pc.row * TILE_SIZE + (pc.pixelOffsetY ?? 8)) * zoom);
-      const cupZY = pc.row * TILE_SIZE + (pc.pixelOffsetY ?? 8) + 1;
+      // Ensure cup sorts on top of multi-tile desks (adding a tile offset when placed on desk rows)
+      const cupZY = (pc.row + 1) * TILE_SIZE + (pc.pixelOffsetY ?? 8) + 2;
       drawables.push({
         zY: cupZY,
         draw: (c) => {
           renderPlacedCoffeeCup(c, cupX, cupY, pc.state === 'full', zoom);
         },
       });
```

---

## 4. Testing & Verification Plan

### Test Suite Integrity

1. **Server Unit Tests:**
   ```bash
   npm run test
   ```
   _Expected:_ 27 suites, 403 passing tests.
2. **Webview Unit Tests:**
   ```bash
   npm run test:webview
   ```
   _Expected:_ 18 suites, 130 passing tests.
3. **TypeScript Typecheck:**
   ```bash
   npm run check-types
   ```
   _Expected:_ 0 type errors across both root and webview-ui projects.

### New Regression Test Suite (`webview-ui/test/simulationBugs.test.ts`)

Create a dedicated test file to assert that:

- `reassignSeat` does not unseat the character if the target seat is already assigned.
- `agentToolsClear` does not cancel characters with `orderStatus === 'running'`.
- `startAgentBreak` honors `explicitSpot` and does not randomize when provided.
- `returnAgentFromBreak` transitions to `CharacterState.WALK` when not at seat, and does NOT enter `CharacterState.TYPE` unless `tileCol === seatCol && tileRow === seatRow`.
- Break room fallback spot has `isSitting: true`.
- Mug washing routes agent back to workstation when not on break.

---

## 5. Rollback & Risk Mitigation

- All edits are strictly scoped to logic bug fixes without altering public wire types or breaking existing layout JSON schemas.
- If any test regression occurs, changes can be rolled back on a per-file basis using Git (`git checkout -- <file>`).
