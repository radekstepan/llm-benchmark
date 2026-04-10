# Coding Conventions

**Analysis Date:** 2026-04-10

## Naming Patterns

**Files:**
- TypeScript files use `.ts` extension for logic modules
- React/Ink components use `.tsx` extension
- Filenames use camelCase for utilities and services: `benchmarker.ts`, `lms.ts`, `config.ts`
- Screen components use PascalCase with `Screen` suffix: `InitScreen.tsx`, `ModelSelectScreen.tsx`

**Functions:**
- camelCase for all functions: `loadModel`, `findMaxContext`, `generateDummyPrompt`
- Async functions follow same convention: `async function startServer(): Promise<void>`
- Event handlers prefixed with `on`: `onModelSelectConfirmed`, `onContextProbe`, `onSpeedTest`

**Variables:**
- camelCase for local variables and parameters: `modelId`, `contextSize`, `maxContext`
- UPPER_SNAKE_CASE for constants: `LMS_BASE_URL`, `INFERENCE_TIMEOUT_MS`, `BENCHMARK_FRACTIONS`
- Private/module-level state uses regular camelCase: `isShuttingDown`, `abortController`

**Types:**
- PascalCase for interfaces and types: `ModelInfo`, `TestResult`, `HardwareInfo`, `AppStore`
- Interface names do not use `I` prefix: `interface Props`, `interface BenchmarkProgressCallback`
- Type aliases use PascalCase: `type Screen = 'init' | 'model-select' | 'benchmarking' | 'summary'`

**Classes:**
- PascalCase for class names: `ModelLoadOOMError`, `ModelNotFoundError`, `TimeoutError`, `InferenceOOMError`
- Custom error classes extend `Error` and set `this.name` to match class name

## Code Style

**Formatting:**
- TypeScript with strict mode enabled (`"strict": true` in tsconfig.json)
- ES2022 target with ESNext modules
- JSX transformed via `react-jsx` (no explicit React imports needed for JSX)
- 2-space indentation (observed in source files)
- Trailing commas in multi-line objects/arrays

**Linting:**
- No ESLint or Prettier configuration detected
- Code follows consistent formatting despite lack of tooling

**Imports:**
- Node.js built-ins use `node:` prefix: `import { performance } from 'node:perf_hooks'`, `import { createHash } from 'node:crypto'`
- ESM imports always include `.js` extension: `import { App } from './ui/App.js'`

## Import Organization

**Order:**
1. External packages (React, Zod, etc.)
2. Node.js built-ins with `node:` prefix
3. Internal modules (relative imports with `.js` extension)

**Example from `src/index.tsx`:**
```typescript
import React from 'react';
import { render } from 'ink';
import { App } from './ui/App.js';
import { useAppStore } from './ui/store.js';
import { startServer, getModels, unloadAll, unloadAllSync, stopServerSync } from './cli/lms.js';
import { getHardwareInfo, upsertModelSettings } from './utils/config.js';
import { findMaxContext, benchmarkSpeeds } from './core/benchmarker.js';
import type { BenchmarkEntry } from './utils/config.js';
```

**Path Aliases:**
- No path aliases configured
- All internal imports use relative paths: `'../../utils/config.js'`, `'../store.js'`

## Error Handling

**Custom Error Classes:**
```typescript
// Location: src/cli/lms.ts
export class ModelLoadOOMError extends Error {
  constructor(modelId: string) {
    super(`Out of memory when loading model: ${modelId}`);
    this.name = 'ModelLoadOOMError';
  }
}

// Location: src/core/benchmarker.ts
export class TimeoutError extends Error {
  constructor() {
    super('Inference timed out');
    this.name = 'TimeoutError';
  }
}
```

**Error Pattern:**
- Throw typed errors for specific failure modes
- Catch and re-throw with additional context
- Use type narrowing with `err as { stderr?: string }` pattern for unknown errors
- Best-effort cleanup in catch blocks (no re-throw for non-critical failures)

**Example from `src/cli/lms.ts`:**
```typescript
try {
  await execa('lms', ['load', modelId, '--gpu=max', ...]);
} catch (err: unknown) {
  const e = err as { stderr?: string; message?: string };
  const stderr = (e.stderr ?? e.message ?? '').toLowerCase();
  if (stderr.includes('out of memory') || stderr.includes('oom')) {
    throw new ModelLoadOOMError(modelId);
  }
  throw new Error(`Failed to load model ${modelId}: ${stderr}`);
}
```

## Logging

**Framework:** Console directly (no logging library)

**Patterns:**
- Use `console.error` for error messages: `console.error('Fatal error:', err)`
- Use `process.stdout.write` for exit messages: `process.stdout.write('\n🧹 Gracefully cleaned up...')`
- State-based logging via callbacks: `callbacks.onLog?.('message')`
- UI logs stored in state array: `logs: string[]` in store, displayed with `logs.slice(-5)`

**Emoji Use:**
- Status indicators: `✓ Finished`, `🧹 Cleaned up`

## Comments

**Section Headers:**
Use comment blocks to separate logical sections:
```typescript
// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Benchmarking queue processor
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
```

**JSDoc/TSDoc:**
- Public functions have JSDoc comments
- Complex algorithms have inline explanations
- Example from `src/core/benchmarker.ts`:
```typescript
/**
 * Generate a dummy prompt of approximately `targetTokens` tokens using
 * cl100k_base encoding. Repeats a neutral paragraph to avoid pathological
 * LLM generation behaviour caused by random token sequences.
 */
export function generateDummyPrompt(targetTokens: number): string {
```

**When to Comment:**
- Exported function signatures
- Non-obvious algorithmic decisions
- Edge cases and workarounds
- Safety comments for synchronous exit handlers

## Function Design

**Size:** Functions range from small utilities (5-10 lines) to orchestrators (100+ lines)

**Parameters:**
- Use object destructuring for multiple options: `callbacks: BenchmarkProgressCallback = {}`
- Use TypeScript interfaces for complex parameter types

**Return Values:**
- Async functions return `Promise<T>`
- Void functions explicitly typed: `Promise<void>`
- Use typed interfaces for return types: `TestResult`, `HardwareInfo`

**Callbacks:**
```typescript
export interface BenchmarkProgressCallback {
  onContextProbe?: (context: number, status: 'load' | 'test' | 'oom' | 'ok') => void;
  onSpeedTest?: (fraction: number, result: TestResult | null) => void;
  onLog?: (msg: string) => void;
}
```

## Module Design

**Exports:**
- Named exports preferred over default exports
- Export types alongside implementations: `export type BenchmarkEntry = z.infer<typeof BenchmarkEntrySchema>`
- Re-export types from schema definitions

**Barrel Files:**
- No barrel/index files detected
- Direct imports from individual modules

**File Organization:**
- One primary export per file when appropriate
- Related types exported together with their schemas

## Configuration Patterns

**Zod Schemas:**
```typescript
// Location: src/utils/config.ts
export const BenchmarkEntrySchema = z.object({
  contextUsed: z.number(),
  ttftMs: z.number(),
  tps: z.number(),
});

export const ModelSettingsSchema = z.object({
  modelId: z.string(),
  hardwareFingerprint: z.string(),
  maxContext: z.number(),
  benchmarks: z.array(BenchmarkEntrySchema),
});

export type BenchmarkEntry = z.infer<typeof BenchmarkEntrySchema>;
export type ModelSettings = z.infer<typeof ModelSettingsSchema>;
```

**Environment:**
- Node.js version specified via `.nvmrc` file
- No environment variables detected (uses local LM Studio CLI)

## React/Ink Component Patterns

**Component Structure:**
```typescript
// Location: src/ui/screens/ModelSelectScreen.tsx
interface Props {
  models: ModelInfo[];
  onConfirm: (selectedIds: string[]) => void;
}

export function ModelSelectScreen({ models, onConfirm }: Props): React.ReactElement {
  // Component implementation
}
```

**Hooks Usage:**
- `useInput` from Ink for keyboard handling
- `useApp` from Ink for `exit()` function
- `useState` for local component state
- Zustand's `useAppStore` for global state

**State Management (Zustand):**
```typescript
// Location: src/ui/store.ts
export const useAppStore = create<AppStore>((set) => ({
  screen: 'init',
  models: [],
  // ... initial state

  setScreen: (screen) => set({ screen }),
  updateLive: (patch) => set((state) => ({
    live: { ...state.live, ...patch },
  })),
}));
```

**Component Composition:**
- Single `App` component routes between screens based on state
- Screen components receive props from parent, don't access store directly
- Store updates trigger re-renders via Zustand hooks

---

*Convention analysis: 2026-04-10*