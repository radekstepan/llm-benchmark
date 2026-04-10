# Codebase Structure

**Analysis Date:** 2026-04-10

## Directory Layout

```
llm-benchmark/
├── src/                    # Source code (TypeScript)
│   ├── cli/               # External CLI integrations
│   │   └── lms.ts         # LM Studio CLI wrapper
│   ├── core/              # Business logic (UI-agnostic)
│   │   └── benchmarker.ts # Benchmarking algorithms
│   ├── ui/                # React/Ink terminal UI
│   │   ├── App.tsx        # Screen router component
│   │   ├── store.ts       # Zustand global state
│   │   └── screens/       # Individual screen components
│   │       ├── InitScreen.tsx
│   │       ├── ModelSelectScreen.tsx
│   │       ├── BenchmarkScreen.tsx
│   │       └── SummaryScreen.tsx
│   ├── utils/             # Shared utilities
│   │   └── config.ts      # Schemas, file I/O, hardware
│   └── index.tsx          # Entry point + orchestration
├── dist/                  # Compiled JavaScript output
├── package.json           # Dependencies and scripts
├── tsconfig.json          # TypeScript configuration
└── yarn.lock              # Dependency lockfile
```

## Directory Purposes

**src/cli/:**
- Purpose: Integration with external CLI tools
- Contains: Process spawning wrappers, error parsing
- Key files: `lms.ts` - LM Studio CLI commands (start/stop server, load/unload models, list models)

**src/core/:**
- Purpose: UI-agnostic benchmarking logic
- Contains: Algorithms, timing, token generation
- Key files: `benchmarker.ts` - Binary search for max context, speed benchmarking, inference measurement

**src/ui/:**
- Purpose: Terminal user interface components
- Contains: React/Ink components, state store
- Key files: `App.tsx` (screen router), `store.ts` (Zustand state)

**src/ui/screens/:**
- Purpose: Individual screen components for each app phase
- Contains: One component per screen state
- Key files: Init (loading), ModelSelect (user input), Benchmark (progress), Summary (results)

**src/utils/:**
- Purpose: Cross-cutting utilities and configuration
- Contains: Zod schemas, file I/O, hardware detection
- Key files: `config.ts` - ModelSettings schema, hardware fingerprinting, atomic saves

**dist/:**
- Purpose: Compiled JavaScript output
- Contains: Transpiled .js files, source maps, .d.ts declarations
- Generated: Yes (via `tsc`)

## Key File Locations

**Entry Points:**
- `src/index.tsx`: Main CLI entry point with shebang (`#!/usr/bin/env node`)
- `src/ui/App.tsx`: React component router for screen rendering

**Configuration:**
- `package.json`: Dependencies, bin definition, scripts
- `tsconfig.json`: TypeScript compiler options (ESNext modules, react-jsx)

**Core Logic:**
- `src/core/benchmarker.ts`: Benchmarking algorithms (context search, speed tests)
- `src/cli/lms.ts`: LM Studio CLI integration
- `src/utils/config.ts`: Schemas, persistence, hardware detection

**State Management:**
- `src/ui/store.ts`: Zustand store with all application state

**UI Screens:**
- `src/ui/screens/InitScreen.tsx`: Startup loading screen
- `src/ui/screens/ModelSelectScreen.tsx`: Interactive model selection
- `src/ui/screens/BenchmarkScreen.tsx`: Live progress display
- `src/ui/screens/SummaryScreen.tsx`: Final results view

**Testing:**
- Not currently present - no test files detected

## Naming Conventions

**Files:**
- TypeScript source: PascalCase for components (`App.tsx`, `InitScreen.tsx`), camelCase for logic (`lms.ts`, `benchmarker.ts`, `config.ts`)
- TypeScript extension: `.tsx` for React components, `.ts` for pure TypeScript

**Directories:**
- Lowercase: `cli/`, `core/`, `ui/`, `utils/`, `screens/`
- Flat structure within directories (no nested subdirectories)

## Where to Add New Code

**New Feature (benchmarking logic):**
- Primary code: `src/core/benchmarker.ts`
- Types: `src/utils/config.ts` (if new schemas needed)

**New Screen:**
- Implementation: `src/ui/screens/NewScreen.tsx`
- Import in: `src/ui/App.tsx`
- Add screen type to: `src/ui/store.ts` Screen union type

**New CLI Integration:**
- Implementation: `src/cli/` (new file or extend `lms.ts`)

**New Utility/Hook:**
- Shared utilities: `src/utils/`
- UI hooks: `src/ui/` (co-located with components)

**New State:**
- Add to: `src/ui/store.ts` AppStore interface and initial state

## Special Directories

**.planning/:**
- Purpose: Planning documents for GSD workflow
- Contains: Codebase analysis documents
- Generated: By GSD tools
- Committed: Yes (tracking planning artifacts)

**dist/:**
- Purpose: Compiled JavaScript output
- Contains: Transpiled code from `src/`
- Generated: Yes (by `npm run build`)
- Committed: No (gitignored)

**node_modules/:**
- Purpose: NPM dependencies
- Generated: Yes (by `yarn install`)
- Committed: No (gitignored)

## Runtime File Artifacts

**benchmark-settings.json:**
- Location: Current working directory (where CLI runs)
- Purpose: Persisted benchmark results
- Written atomically via `.tmp` file
- Schema defined in: `src/utils/config.ts` SettingsFileSchema

---

*Structure analysis: 2026-04-10*