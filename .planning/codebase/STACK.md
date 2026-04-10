# Technology Stack

**Analysis Date:** 2026-04-10

## Languages

**Primary:**
- TypeScript 6.0.2 - All source code in `src/` directory
- Target: ES2022 (per `tsconfig.json`)

**Secondary:**
- None detected

## Runtime

**Environment:**
- Node.js v24.14.1 (specified in `.nvmrc`)
- ESM modules (`"type": "module"` in `package.json`)

**Package Manager:**
- Yarn (lockfile: `yarn.lock` present)
- No `package-lock.json` detected

## Frameworks

**Core:**
- React 19.2.5 - UI framework
- Ink 7.0.0 - React-based CLI UI framework

**State Management:**
- Zustand 5.0.12 - Global state store (`src/ui/store.ts`)

**Validation:**
- Zod 4.3.6 - Schema validation for settings and config

## Key Dependencies

**Critical:**
- `openai` 6.34.0 - OpenAI SDK for LM Studio API communication (`src/core/benchmarker.ts`)
- `execa` 9.6.1 - Process execution for `lms` CLI (`src/cli/lms.ts`)
- `tiktoken` 1.0.22 - Token counting for prompt generation (`src/core/benchmarker.ts`)
- `systeminformation` 5.31.5 - Hardware detection (`src/utils/config.ts`)

**Infrastructure:**
- `ink-spinner` 5.0.0 - Loading spinners for CLI

## Configuration

**TypeScript:**
- Config: `tsconfig.json`
- Target: ES2022
- Module: ESNext
- Module resolution: bundler
- JSX: react-jsx
- Strict mode: enabled
- Output: `dist/`

**Build:**
- `tsc` - TypeScript compiler directly (no bundler)
- Declaration maps and source maps enabled

## Platform Requirements

**Development:**
- Node.js v24.14.1+ (via `.nvmrc`)
- Yarn package manager
- TypeScript 6.0.2

**Production:**
- Node.js runtime
- LM Studio installed and available in PATH (`lms` CLI command)
- GPU with sufficient VRAM for model inference

## Build Output

**Entry Points:**
- `src/index.tsx` → `dist/index.js` (CLI binary: `llm-benchmark`)

**Scripts:**
- `yarn build` - Compile TypeScript to `dist/`
- `yarn start` - Run compiled CLI
- `yarn dev` - Build and run in one command

---

*Stack analysis: 2026-04-10*