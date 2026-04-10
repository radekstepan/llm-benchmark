# Codebase Concerns

**Analysis Date:** 2026-04-10

## Critical Issues

### Empty Catch Blocks (High)
- **Issue:** Multiple `catch {}` blocks silently swallow errors without logging or handling
- **Files:**
  - `src/cli/lms.ts:41` - Server readiness polling errors ignored
  - `src/cli/lms.ts:55` - Server start errors ignored
  - `src/cli/lms.ts:67` - Server stop errors ignored
  - `src/cli/lms.ts:78` - Sync server stop errors ignored
  - `src/cli/lms.ts:153` - Unload errors ignored
  - `src/cli/lms.ts:164` - Sync unload errors ignored
  - `src/core/benchmarker.ts:123` - Warm-up run failures silently discarded
  - `src/utils/config.ts:89` - Corrupted settings file silently replaced with empty state
- **Impact:** Errors go undetected, making debugging extremely difficult; operations may fail silently
- **Fix approach:** Log errors at minimum; consider specific error handling with user feedback

### Abort Controller State Management (High)
- **Issue:** Global `abortController` in `src/index.tsx:19` is created once but never reset between tests
- **Files:** `src/index.tsx:19`
- **Impact:** If a test times out and triggers abort, subsequent tests will immediately abort since the controller remains in aborted state
- **Fix approach:** Create new `AbortController` for each test run; pass into benchmark functions

## Technical Debt

### Token Counting Approximation (Medium)
- **Issue:** Token counting uses `totalTokens += 1` approximation instead of accurate tiktoken counting
- **Files:** `src/core/benchmarker.ts:152`
- **Impact:** TPS (tokens per second) metrics are inaccurate; could be off by 2-3x depending on token composition
- **Fix approach:** Use tiktoken to count actual tokens from accumulated content, or count after stream ends

### Hardware Fingerprint Incomplete (Medium)
- **Issue:** Hardware fingerprint hash excludes CPU model, only uses RAM and GPU VRAM
- **Files:** `src/utils/config.ts:57-60`
- **Code:**
  ```typescript
  const fingerprint = createHash('sha256')
    .update(`${cpuModel}|${ramGb}|${gpuVram}`)  // cpuModel IS included
    .digest('hex')
    .slice(0, 16);
  ```
- **Wait, actually:** CPU model IS in the hash string, but `gpuModel` (the GPU name string) is NOT - only `gpuVram` is used
- **Impact:** Two systems with same RAM and VRAM but different GPU models will have same fingerprint, potentially causing benchmark results to be incorrectly shared
- **Fix approach:** Include `gpuModel` in the hash

### Binary Search Upper Bound Hardcoded (Medium)
- **Issue:** `MAX_CONTEXT_GUESS = 32_768` is hardcoded
- **Files:** `src/core/benchmarker.ts:19`
- **Impact:** Models capable of larger context windows (e.g., 128K context) will not be properly benchmarked; binary search artificially caps at 32K
- **Fix approach:** Dynamically determine upper bound from GPU VRAM or allow configuration

### Settings File Location (Medium)
- **Issue:** Settings file written to `process.cwd()` rather than a dedicated location
- **Files:** `src/utils/config.ts:72-78`
- **Impact:** Running from different directories creates multiple settings files; results are scattered and not persisted reliably
- **Fix approach:** Use OS-appropriate config directory (e.g., `~/.config/llm-benchmark/` or `os.homedir()`)

## Error Handling Gaps

### No User Feedback on Critical Failures (Medium)
- **Issue:** When operations fail (model load, server start), errors are caught but users may not know what went wrong
- **Files:** `src/index.tsx:88-91`, `src/index.tsx:120-122`
- **Impact:** Users see incomplete benchmark results without understanding why
- **Fix approach:** Store error state in Zustand store; display errors in UI

### Warm-Up Failures Ignored (Medium)
- **Issue:** Warm-up run failure is silently swallowed
- **Files:** `src/core/benchmarker.ts:112-125`
- **Impact:** If model fails during warm-up (e.g., model not loaded), the actual test proceeds anyway and may fail with unclear error
- **Fix approach:** Log warm-up failure; optionally retry or inform user

### JSON Parse Errors Not User-Friendly (Low)
- **Issue:** `JSON.parse` failure in `getModels()` throws generic error
- **Files:** `src/cli/lms.ts:99-100`
- **Impact:** If LM Studio output format changes, users get cryptic error message
- **Fix approach:** Provide specific error with context about what was expected

## Security Considerations

### No Security Issues Detected (Low Risk)
- No hardcoded secrets
- No `.env` files present
- API key (`lm-studio`) is a placeholder for local development, not a real credential
- All dependencies audited with 0 vulnerabilities

### File Permission Considerations (Low)
- **Issue:** Settings file created with default permissions; no explicit permission restrictions
- **Files:** `src/utils/config.ts:101`
- **Impact:** Benchmark results visible to other users on shared systems
- **Fix approach:** Set restrictive file permissions (`0600`) when creating settings file

## Performance Considerations

### Serial Benchmark Execution (Low)
- **Issue:** Models benchmarked sequentially; no parallelization
- **Files:** `src/index.tsx:53` (for loop in `processQueue`)
- **Impact:** Long wait time when benchmarking multiple models
- **Fix approach:** Not applicable - must be serial since VRAM is shared resource

### Binary Search Iteration Count (Low)
- **Issue:** No upper limit on binary search iterations
- **Files:** `src/core/benchmarker.ts:213`
- **Impact:** Theoretically could loop many times; practically bounded by context range
- **Fix approach:** Add iteration counter with warning if exceeded

## Code Quality Issues

### Missing Test Coverage (High)
- **Issue:** No test files found in codebase
- **Files:** Entire `src/` directory
- **Impact:** No automated verification of core benchmarking logic; regressions may go undetected
- **Priority:** High
- **Fix approach:** Add unit tests for:
  - `generateDummyPrompt()` token counting
  - Binary search logic
  - Hardware fingerprint generation
  - Settings file operations

### Type Safety - Loose Type Assertions (Low)
- **Issue:** Error handling uses `as { stderr?: string; message?: string }` type assertions
- **Files:** `src/cli/lms.ts:131-132`, `src/core/benchmarker.ts:156`
- **Impact:** TypeScript strict mode enabled, but runtime errors could have unexpected shapes
- **Fix approach:** Use type guards or `unknown` with proper narrowing

### React Import Not Used Directly (Low)
- **Issue:** `import React from 'react'` in screen components but JSX transform handles this
- **Files:** All `src/ui/screens/*.tsx` files
- **Impact:** Minor; no runtime issue with modern React
- **Fix approach:** Can be removed with automatic JSX runtime

## Missing Features from plan.md

### ink-multi-select Not Installed (Low)
- **Issue:** Plan mentions using `ink-multi-select` but it's not in dependencies
- **Files:** `package.json`
- **Impact:** Custom input handling implemented instead; works but not as polished
- **Current implementation:** `src/ui/screens/ModelSelectScreen.tsx` uses `useInput` hook with custom state
- **Fix approach:** Either install the package or document intentional decision

### VRAM-Based Context Limit (Low)
- **Issue:** Plan suggests using `VRAM_LIMIT_GUESS` derived from actual GPU VRAM
- **Files:** Plan mentions this in Phase 3
- **Impact:** Fixed 32K limit may be too high for low-VRAM GPUs or too low for high-VRAM GPUs
- **Fix approach:** Add heuristics based on `gpuVram` from hardware detection

### Detailed Progress Tracking (Low)
- **Issue:** Plan mentions progress bar during binary search with status indicators
- **Files:** Plan Phase 3, `src/ui/screens/BenchmarkScreen.tsx`
- **Impact:** Current implementation shows progress but could be more detailed
- **Fix approach:** Consider adding current probe context to progress display

## Edge Cases

### Empty Model List (Medium)
- **Issue:** If no models found, app proceeds but shows warning
- **Files:** `src/ui/screens/ModelSelectScreen.tsx:72-74`
- **Impact:** User sees empty list; can't proceed
- **Fix approach:** Add exit option or guidance for downloading models

### Model Benchmark Failure Continues Queue (Medium)
- **Issue:** Failed model benchmark is logged but queue continues
- **Files:** `src/index.tsx:88-91`, `src/index.tsx:120-122`
- **Impact:** User may not notice individual model failures if queue is large
- **Fix approach:** Track failure state; show summary of failed models at end

### VRAM Exhaustion During Binary Search (Low)
- **Issue:** If model crashes VRAM state, subsequent loads may fail
- **Files:** `src/core/benchmarker.ts:219`
- **Impact:** Binary search could fail to find correct context
- **Mitigation:** `unloadAll()` is called before each load attempt
- **Fix approach:** Add error recovery with full reset

## Dependency Risks

### External Dependency on LM Studio CLI (High)
- **Issue:** App requires `lms` CLI to be installed and in PATH
- **Files:** `src/cli/lms.ts`
- **Impact:** App fails silently or with cryptic errors if LM Studio not installed
- **Fix approach:** Add startup check for `lms` CLI availability with user-friendly error

### No Version Pinning for LM Studio (Medium)
- **Issue:** `lms` CLI version not checked; API compatibility assumed
- **Files:** `src/cli/lms.ts`
- **Impact:** LM Studio updates could break JSON output format, command syntax
- **Fix approach:** Add version check at startup; warn if incompatible version

---

*Concerns audit: 2026-04-10*