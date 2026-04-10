Here is the expanded and enhanced implementation specification. I’ve injected code-level specifics, edge-case handling strategies, and architectural best practices into each phase to make this a truly robust, plug-and-play guide for your coding assistant.

---

### **LM Studio Benchmarking App: Implementation Specification**

**Objective:** Build a TypeScript-based CLI application using React (via ink) to benchmark local LLMs using LM Studio's `lms` CLI. The app will discover models, allow user selection, execute binary-search context testing and speed benchmarks, and save optimal configurations to a JSON file.

#### **Phase 0: Project Initialization & Dependencies**
* **Initialize Project:** * Run `npm init -y` and `tsc --init`.
    * Update `package.json` to include `"type": "module"`. 
    * In `tsconfig.json`, ensure `"module": "ESNext"`, `"moduleResolution": "node"`, and `"jsx": "react-jsx"` (required for Ink).
* **Install Core Dependencies:**
    * **UI:** `react`, `ink`, `ink-spinner`. For the model checklist, specifically use `ink-multi-select` or build a custom hook using Ink's `useInput` to handle spacebar toggling.
    * **System/CLI:** `execa` (for async, promise-based child processes with excellent cleanup), `systeminformation` (for hardware telemetry).
    * **API:** `openai` (official SDK to communicate with LM Studio's local server).
    * **Utils:** `zod` (for runtime type safety/schema validation), `tiktoken` (for accurate dummy prompt generation).
* **Project Structure:** Set up `src/` with subdirectories:
    * `/ui` (Ink components, screens, hooks)
    * `/core` (benchmarking algorithms, math)
    * `/cli` (LM Studio wrapper functions)
    * `/utils` (file I/O, schemas, logging)

#### **Phase 1: LM Studio CLI Wrapper (`src/cli/lms.ts`)**
Create an abstraction layer to interact with the `lms` CLI using `execa`.
* **Server Management:** * `startServer()`: Execute `lms server start`. **Crucial Detail:** Implement a polling mechanism right after this executes to ping `http://localhost:1234/v1/models` until it returns a 200 OK. Do not proceed until the server is actually ready to receive API calls.
    * `stopServer()`: Execute `lms server stop`.
* **Model Discovery:** * `getModels()`: Execute `lms ls --json`. Wrap the standard output in a `try/catch` with `JSON.parse`. Map the returned structure to a standardized interface: `{ id: string, name: string, sizeBytes: number }`.
* **Model State:** * `loadModel(modelId, contextSize)`: Execute `lms load <modelId> --gpu=max --context-length=<contextSize> --yes`. (Adding `--yes` bypasses interactive confirmation prompts).
    * `unloadAll()`: Execute `lms unload --all`.
* **Error Handling:** If `loadModel` fails, parse `stderr`. If it contains "out of memory", "OOM", or "allocation failed", throw a custom `ModelLoadOOMError`. If it contains "not found", throw a `ModelNotFoundError`.

#### **Phase 2: Configuration & Schemas (`src/utils/config.ts`)**
* **Define Zod Schemas:** ```typescript
    const ModelSettingsSchema = z.object({
      modelId: z.string(),
      hardwareFingerprint: z.string(),
      maxContext: z.number(),
      benchmarks: z.array(z.object({
        contextUsed: z.number(),
        ttftMs: z.number(),
        tps: z.number()
      }))
    });
    ```
* **File I/O Utilities:** * `loadSettings()` and `saveSettings(data)` targeting `benchmark-settings.json`.
    * **Edge Case:** Implement atomic writes (writing to a `.tmp` file and renaming) to prevent file corruption if the user forces an exit mid-save.
    * When saving, deep merge settings based on the combination of `modelId` AND `hardwareFingerprint`.
* **Hardware Profiling:** Use `systeminformation.graphics()` to fetch the primary GPU model and VRAM. Create a deterministic hash (e.g., using Node's native `crypto` module) of the CPU model, RAM amount, and GPU VRAM. This ensures if the user upgrades their GPU, the benchmarks will invalidate and run again.

#### **Phase 3: The Benchmarking Engine (`src/core/benchmarker.ts`)**
This is the brain of the application, decoupled from UI.
* **1. Context Generator Utility:**
    * `generateDummyPrompt(targetTokens: number)`: Use `tiktoken` with the `cl100k_base` encoding. Generate text by repeating a neutral paragraph (e.g., Wikipedia excerpt about physics) rather than random characters. Random strings can cause the LLM to enter unpredictable, infinite-loop generation states, skewing TPS metrics.
* **2. The Single Test Execution:**
    * `runSingleTest(modelId, promptText, expectedMaxTokens)`: Instantiate the OpenAI client.
    * **The Warm-Up Run:** Local LLMs often have a slow first-inference penalty. Run a tiny 10-token completion first and discard the result before starting the timer.
    * **Measurement:** Use `performance.now()` for high-resolution timing. Send the prompt with `stream: true`. Record `startTime`. When the first chunk arrives, record `ttftTime`. When the stream ends, record `endTime`.
    * **Timeout & OOM:** Use an `AbortController`. If 60 seconds pass without the stream completing, trigger `abortController.abort()` and throw a `TimeoutError`.
* **3. Binary Search Max Context Routine:**
    * `findMaxContext(modelId)`: Start at `min = 2048`, `max = VRAM_LIMIT_GUESS` (or 32768).
    * Load model at `midPoint`. If it OOMs *on load*, set `max = midPoint - 1`.
    * If it loads, run `runSingleTest` with a prompt filling 95% of `midPoint`.
    * If inference OOMs (connection reset) or TPS < 2.0 (indicating heavy system RAM swap instead of VRAM), set `max = midPoint - 1`. 
    * If successful, set `min = midPoint + 1`. Loop until `min >= max`.
* **4. Speed Benchmarking Routine:**
    * `benchmarkSpeeds(modelId, actualMaxContext)`: Run `runSingleTest` iteratively with prompts sized at 25%, 50%, 75%, and 100% of the discovered `actualMaxContext`. Return the array of metrics.

#### **Phase 4: Ink TUI Implementation (`src/ui/App.tsx`)**
Use a global state object (e.g., `AppState`) to control which screen renders.
* **Screen 1: Initialization:** Use `<Spinner />` next to `<Text>Detecting Hardware & Waking LM Studio...</Text>`.
* **Screen 2: Model Selection:** Map over the discovered models. Use Ink's `useInput` hook to handle up/down arrow navigation (change active index) and Spacebar (add/remove from a `selectedModels` Set). Press Enter to transition to Screen 3.
* **Screen 3: Active Benchmarking:**
    * **Layout:** Use Ink `<Box flexDirection="column">`.
    * **Top:** `<Text bold color="green">Benchmarking: {currentModel}</Text>`
    * **Middle:** Create a custom progress bar using character repetition (e.g., `[██████░░░░] 60%`).
    * **Bottom:** Display `Current Context: {context} | TTFT: {ttft}ms | Speed: {tps} tok/s`.
    * **Logs:** Maintain an array of `string` logs in state. Use a `<Box height={5} overflowY="hidden">` to display only the last 5 logs (`logs.slice(-5)`).
* **Screen 4: Summary:** Build a formatted grid/table. Show a prompt to exit: `<Text>Press [Q] or [Ctrl+C] to exit.</Text>`

#### **Phase 5: App Orchestration & Graceful Shutdown (`src/index.tsx`)**
* **State Management:** Use Zustand (creates a store outside of React, which is highly beneficial for CLI tools so the benchmarking logic can update state without complex prop drilling).
* **The Master Loop:** * Create an `async function processQueue()`.
    * Iterate through the selected models. Wrap the binary search and speed tests in `try/catch` blocks so one failing model doesn't crash the entire batch.
    * Save intermediate results to `benchmark-settings.json` *after each model finishes*, rather than waiting for the entire queue to complete.
* **Graceful Teardown (CRITICAL):**
    * Register process signal handlers: 
        ```typescript
        process.on('SIGINT', handleExit);
        process.on('SIGTERM', handleExit);
        process.on('uncaughtException', (err) => { console.error(err); handleExit(); });
        ```
    * **The `handleExit` function:**
        1. Set a global `isShuttingDown` flag to break the `processQueue` loop.
        2. Trigger the `AbortController` attached to any pending OpenAI API calls.
        3. Use `execSync` (synchronous execution is required here because Node.js event loops might close during a forceful exit): `execSync('lms unload --all')` and `execSync('lms server stop')`.
        4. Print `\n🧹 Gracefully cleaned up VRAM and stopped LM Studio server.`
        5. `process.exit(0)`.