# Architecture

**Analysis Date:** 2026-04-10

## Pattern Overview

**Overall:** CLI Application with React-based Terminal UI (TUI)

**Key Characteristics:**
- Event-driven async orchestration with screen-based UI navigation
- External process integration via `lms` CLI (LM Studio)
- Zustand state store decoupled from React for CLI-specific control flow
- Atomic file I/O for settings persistence
- Graceful shutdown handling with synchronous cleanup

## Layers

**CLI Integration Layer:**
- Purpose: Abstract LM Studio CLI commands into typed async functions
- Location: `src/cli/lms.ts`
- Contains: Server management, model discovery, model loading/unloading
- Depends on: `execa` for process spawning, LM Studio binary (`lms`)
- Used by: Core benchmarker, main orchestrator

**Core Logic Layer:**
- Purpose: Benchmarking algorithms decoupled from UI
- Location: `src/core/benchmarker.ts`
- Contains: Context binary search, speed testing, inference timing, prompt generation
- Depends on: CLI layer (lms.ts), OpenAI SDK (for inference), tiktoken (token counting)
- Used by: Main orchestrator (index.tsx)

**UI Layer:**
- Purpose: Terminal-based visual interface using React/Ink
- Location: `src/ui/`
- Contains: Screen components, Zustand store integration
- Depends on: Zustand store, React/Ink
- Used by: Main orchestrator renders via Ink

**State Management Layer:**
- Purpose: Global application state outside React tree
- Location: `src/ui/store.ts`
- Contains: Screen state, model selection, live benchmark state, hardware info
- Depends on: Zustand
- Used by: All UI screens, main orchestrator for updates

**Utilities Layer:**
- Purpose: Configuration, schemas, hardware detection
- Location: `src/utils/config.ts`
- Contains: Zod schemas, settings file I/O, hardware fingerprinting
- Depends on: Zod, systeminformation, Node fs/crypto
- Used by: Main orchestrator, core benchmarker types

## Data Flow

**Application Startup Flow:**

1. Entry point (`src/index.tsx`) initializes Zustand store
2. Renders Ink App component with screen state
3. Parallel execution: hardware detection + LM Studio server start
4. Model discovery via `getModels()` CLI call
5. Store updated with hardware/model info, screen transitions

**Benchmark Execution Flow:**

1. User selects models → `onModelSelectConfirmed` resolves promise
2. `processQueue()` iterates selected models sequentially
3. Per model: binary search for max context → speed benchmarks at fractions
4. Each test: `loadModel()` → `runSingleTest()` with streaming → record TTFT/TPS
5. Intermediate results saved atomically to `benchmark-settings.json`
6. Store updated with live progress via callbacks
7. UI re-renders on store changes

**Graceful Shutdown Flow:**

1. SIGINT/SIGTERM/uncaughtException triggers `handleExit()`
2. `isShuttingDown` flag breaks async loops
3. AbortController cancels pending OpenAI requests
4. Synchronous cleanup: `unloadAllSync()` + `stopServerSync()`
5. Process exits with message

**State Management:**
- Zustand store created outside React (critical for CLI orchestration)
- Direct store access via `useAppStore.getState()` in async code
- React components use `useAppStore()` hook for reactive updates
- Store actions are simple setters/patches (no complex reducers)

## Key Abstractions

**BenchmarkProgressCallback:**
- Purpose: Progress reporting from core layer to UI without coupling
- Examples: `src/core/benchmarker.ts` lines 191-195
- Pattern: Optional callback functions passed to benchmark functions
- Usage: `onContextProbe(context, status)`, `onSpeedTest(fraction, result)`, `onLog(msg)`

**LiveBenchmarkState:**
- Purpose: Real-time benchmark progress for UI display
- Examples: `src/ui/store.ts` lines 19-28
- Pattern: Plain object with primitive fields updated immutably
- Fields: currentModel, phase, progress, currentContext, currentTtft, currentTps, logs

**ModelSettings:**
- Purpose: Persisted benchmark results keyed by model + hardware
- Examples: `src/utils/config.ts` lines 17-22
- Pattern: Zod-validated schema with atomic file writes
- Contains: modelId, hardwareFingerprint, maxContext, benchmarks array

## Entry Points

**CLI Entry Point:**
- Location: `src/index.tsx`
- Triggers: `node dist/index.js` or `llm-benchmark` bin command
- Responsibilities: Orchestrates startup, wires shutdown handlers, manages queue processing

**Screen Router:**
- Location: `src/ui/App.tsx`
- Triggers: Ink render on store.screen changes
- Responsibilities: Conditionally renders screen based on current state

## Error Handling

**Strategy:** Typed custom errors with graceful degradation

**Patterns:**
- Custom error classes: `ModelLoadOOMError`, `ModelNotFoundError`, `TimeoutError`, `InferenceOOMError`
- Error detection via stderr parsing and connection reset detection
- Try/catch in queue processor allows one model failure without crashing batch
- Uncaught exceptions trigger graceful shutdown

**Error Class Locations:**
- CLI errors: `src/cli/lms.ts` lines 6-18
- Benchmark errors: `src/core/benchmarker.ts` lines 29-42

## Cross-Cutting Concerns

**Logging:** Console-style logging to store's log array, displayed in UI with last 5 entries

**Validation:** Zod schemas for all persisted data, runtime type safety on file reads

**Process Management:** `execa` for async CLI calls, `execaSync` for synchronous cleanup

**Hardware Fingerprinting:** SHA-256 hash of CPU+RAM+GPU used to invalidate stale benchmark results

**Atomic File Writes:** Write to `.tmp` then rename to prevent corruption on interrupted saves

**Abort Handling:** AbortController shared across inference calls, triggered on shutdown

---

*Architecture analysis: 2026-04-10*