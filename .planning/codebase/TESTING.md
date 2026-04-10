# Testing Patterns

**Analysis Date:** 2026-04-10

## Test Framework

**Status:** Not configured

**Current State:**
- No test framework installed in `package.json`
- No test files in `src/` directory
- No test configuration files (jest.config.*, vitest.config.*, etc.)
- No test scripts in package.json

**Package.json Scripts:**
```json
{
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "dev": "tsc && node dist/index.js"
  }
}
```

## Test File Organization

**Current Structure:** None

**Source Structure for Reference:**
```
src/
├── cli/
│   └── lms.ts           # LM Studio CLI wrapper
├── core/
│   └── benchmarker.ts   # Benchmarking algorithms
├── ui/
│   ├── App.tsx          # Main app component
│   ├── store.ts         # Zustand state store
│   └── screens/         # UI screen components
│       ├── InitScreen.tsx
│       ├── ModelSelectScreen.tsx
│       ├── BenchmarkScreen.tsx
│       └── SummaryScreen.tsx
├── utils/
│   └── config.ts        # Zod schemas, file I/O, hardware info
└── index.tsx            # Entry point
```

## Recommendations

### Test Framework Setup

**Recommended:** Vitest (fast, ESM-native, TypeScript-friendly)

**Install:**
```bash
npm install -D vitest @vitest/coverage-v8
```

**Add to package.json:**
```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage"
  }
}
```

### Test File Organization

**Recommended Structure:**
```
src/
├── cli/
│   ├── lms.ts
│   └── lms.test.ts        # Co-located with source
├── core/
│   ├── benchmarker.ts
│   └── benchmarker.test.ts
├── utils/
│   ├── config.ts
│   └── config.test.ts
```

### Priority Test Areas

**High Priority:**

1. **`src/core/benchmarker.ts`**
   - `generateDummyPrompt()` - test token count accuracy
   - Binary search logic in `findMaxContext()` - test bounds handling
   - Edge cases for TPS/TTFT calculations

2. **`src/utils/config.ts`**
   - Schema validation with Zod
   - File I/O operations (with mocked filesystem)
   - Hardware fingerprint generation
   - Upsert logic for model settings

3. **`src/cli/lms.ts`**
   - Error classification (OOM vs NotFound vs generic)
   - Model list parsing from JSON output

**Medium Priority:**

4. **`src/ui/store.ts`**
   - Zustand store actions
   - State immutability

**Low Priority:**

5. **UI Components (`src/ui/screens/`)**
   - Ink components are difficult to test without E2E setup
   - Consider integration/E2E tests instead

### Suggested Test Patterns

**Unit Test Pattern:**
```typescript
// src/core/benchmarker.test.ts
import { describe, it, expect } from 'vitest';
import { generateDummyPrompt } from './benchmarker.js';

describe('generateDummyPrompt', () => {
  it('should generate approximately the requested token count', () => {
    const prompt = generateDummyPrompt(100);
    // Verify it's a non-empty string
    expect(prompt.length).toBeGreaterThan(0);
  });

  it('should use neutral source text', () => {
    const prompt = generateDummyPrompt(10);
    expect(prompt).toContain('In physics');
  });
});
```

**Mocking External Processes:**
```typescript
// src/cli/lms.test.ts
import { describe, it, expect, vi } from 'vitest';
import { execa } from 'execa';

vi.mock('execa', () => ({
  execa: vi.fn(),
}));

describe('getModels', () => {
  it('should parse model list from JSON output', async () => {
    vi.mocked(execa).mockResolvedValue({
      stdout: JSON.stringify([
        { modelKey: 'model-a', displayName: 'Model A', sizeBytes: 1000000 }
      ]),
    } as any);
    
    const models = await getModels();
    expect(models).toHaveLength(1);
    expect(models[0].id).toBe('model-a');
  });
});
```

**Schema Validation Test:**
```typescript
// src/utils/config.test.ts
import { describe, it, expect } from 'vitest';
import { BenchmarkEntrySchema, ModelSettingsSchema } from './config.js';

describe('BenchmarkEntrySchema', () => {
  it('should validate correct input', () => {
    const result = BenchmarkEntrySchema.safeParse({
      contextUsed: 4096,
      ttftMs: 150,
      tps: 45.5,
    });
    expect(result.success).toBe(true);
  });

  it('should reject missing fields', () => {
    const result = BenchmarkEntrySchema.safeParse({
      contextUsed: 4096,
      // missing ttftMs and tps
    });
    expect(result.success).toBe(false);
  });
});
```

**Store Test Pattern:**
```typescript
// src/ui/store.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore } from './store.js';

describe('useAppStore', () => {
  beforeEach(() => {
    // Reset store state between tests
    useAppStore.setState({
      screen: 'init',
      models: [],
      selectedModels: new Set(),
    });
  });

  it('should toggle model selection', () => {
    const { toggleModelSelection, selectedModels } = useAppStore.getState();
    toggleModelSelection('model-a');
    expect(useAppStore.getState().selectedModels.has('model-a')).toBe(true);
    
    toggleModelSelection('model-a');
    expect(useAppStore.getState().selectedModels.has('model-a')).toBe(false);
  });
});
```

### Test Coverage Areas

**Untested Areas (Current):**
- All business logic in `benchmarker.ts`
- File I/O operations in `config.ts`
- CLI integration in `lms.ts`
- State management in `store.ts`
- Error handling paths
- Edge cases (OOM, timeout, connection reset)

**Test Coverage Requirements:**
- Not currently enforced
- Recommend adding coverage threshold after test setup

### Integration Testing Considerations

**External Dependencies:**
- LM Studio CLI (`lms` command) - requires mocking or test fixtures
- OpenAI API (localhost:1234) - requires mock server
- File system - requires temp directories or mocking
- Hardware detection - requires `systeminformation` mocking

**Mock Strategy:**
- Mock `execa` for CLI tests
- Mock OpenAI client for benchmark tests
- Use temp directories for file I/O tests
- Mock `systeminformation` for hardware detection tests

### E2E Testing

**Current Status:** Not applicable (CLI tool requiring external LM Studio)

**Future Consideration:**
- Integration tests with a mock LM Studio server
- Test fixtures for model responses
- Snapshot testing for CLI output

---

*Testing analysis: 2026-04-10*