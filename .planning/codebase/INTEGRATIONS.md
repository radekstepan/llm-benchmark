# External Integrations

**Analysis Date:** 2026-04-10

## APIs & External Services

**LM Studio (Primary Integration):**
- Purpose: Local LLM inference server and model management
- SDK: `openai` package (v6.34.0) - Uses OpenAI-compatible API
- API Base URL: `http://localhost:1234/v1`
- Auth: None (local server, uses `apiKey: 'lm-studio'` placeholder)
- Files: `src/core/benchmarker.ts`, `src/cli/lms.ts`

**OpenAI API Compatibility:**
- Used to communicate with LM Studio's local server
- Endpoints: `/v1/chat/completions`, `/v1/models`
- Streaming: Enabled for token-level timing (TTFT measurement)

## CLI Tools

**lms CLI (LM Studio Command Line):**
- Purpose: Model discovery, loading, unloading, server control
- Integration: `execa` package for process spawning
- Commands used:
  - `lms server start` - Start the inference server
  - `lms server stop` - Stop the inference server
  - `lms ls --json` - List available models (JSON output)
  - `lms load <model> --gpu=max --context-length=<n> --yes` - Load model with context size
  - `lms unload --all` - Unload all models from VRAM
- Files: `src/cli/lms.ts`

## Data Storage

**Local Files:**
- `benchmark-settings.json` - Persists benchmark results per model/hardware
- Schema: Validated with Zod (`ModelSettingsSchema`, `SettingsFileSchema`)
- Atomic writes: Uses `.tmp` file + rename pattern
- Files: `src/utils/config.ts`

**File System Operations:**
- Read/write JSON configuration
- Uses Node.js `fs` module (`readFileSync`, `writeFileSync`, `renameSync`, `existsSync`)
- Path resolution: Current working directory

## Hardware Detection

**System Information:**
- Library: `systeminformation` (v5.31.5)
- Data collected:
  - CPU: Manufacturer + Brand name
  - RAM: Total memory in GB
  - GPU: Model + VRAM from graphics controllers
- Files: `src/utils/config.ts`

**Hardware Fingerprint:**
- SHA-256 hash of `cpuModel|ramGb|gpuVram`
- Used to identify unique hardware configurations for benchmark comparison

## Caching

**None detected** - No Redis, in-memory cache, or similar caching layer.

## Authentication & Identity

**Not applicable** - Local CLI tool, no user authentication.

## Monitoring & Observability

**Error Tracking:**
- None detected - Errors logged to console

**Logs:**
- In-app log display via Zustand store (`live.logs` array)
- CLI stdout for fatal errors

## CI/CD & Deployment

**Hosting:**
- Local CLI application (no deployment target)

**CI Pipeline:**
- None detected

## Environment Configuration

**Required env vars:**
- None detected

**External Dependencies:**
- LM Studio must be installed and `lms` CLI available in PATH
- LM Studio server runs on `localhost:1234`

## Webhooks & Callbacks

**Incoming:**
- None

**Outgoing:**
- None

---

*Integration audit: 2026-04-10*