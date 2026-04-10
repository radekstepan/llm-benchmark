import { performance } from 'node:perf_hooks';
import OpenAI from 'openai';
import { get_encoding } from 'tiktoken';
import type { BenchmarkEntry } from '../utils/config.js';
import {
  loadModel,
  unloadAll,
  ModelLoadOOMError,
} from '../cli/lms.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LMS_BASE_URL = 'http://localhost:1234/v1';
const WARMUP_TOKENS = 10;
const INFERENCE_TIMEOUT_MS = 60_000;
const MIN_CONTEXT = 2048;
const MAX_CONTEXT_GUESS = 32_768;
const MIN_VIABLE_TPS = 2.0;
/** Use 95% of max context for the binary-search probe. */
const CONTEXT_FILL_RATIO = 0.95;
const BENCHMARK_FRACTIONS = [0.25, 0.5, 0.75, 1.0];

// ---------------------------------------------------------------------------
// Custom error types
// ---------------------------------------------------------------------------

export class TimeoutError extends Error {
  constructor() {
    super('Inference timed out');
    this.name = 'TimeoutError';
  }
}

export class InferenceOOMError extends Error {
  constructor() {
    super('Connection reset during inference — likely VRAM OOM');
    this.name = 'InferenceOOMError';
  }
}

// ---------------------------------------------------------------------------
// Dummy prompt generator
// ---------------------------------------------------------------------------

const SOURCE_TEXT =
  'In physics, the standard model of particle physics is the theory describing ' +
  'three of the four known fundamental forces — electromagnetic, weak and strong — ' +
  'in the universe as well as classifying all known elementary particles. ' +
  'It was developed in stages throughout the latter half of the twentieth century, ' +
  'through the work of many scientists worldwide. ';

/**
 * Generate a dummy prompt of approximately `targetTokens` tokens using
 * cl100k_base encoding. Repeats a neutral paragraph to avoid pathological
 * LLM generation behaviour caused by random token sequences.
 */
export function generateDummyPrompt(targetTokens: number): string {
  const enc = get_encoding('cl100k_base');
  const chunkTokens = enc.encode(SOURCE_TEXT).length;
  enc.free();

  const repeats = Math.max(1, Math.ceil(targetTokens / chunkTokens));
  const full = SOURCE_TEXT.repeat(repeats);

  // Trim to exact token count via binary search on character count
  let lo = 0;
  let hi = full.length;
  const enc2 = get_encoding('cl100k_base');
  while (lo < hi) {
    const mid = Math.floor((lo + hi + 1) / 2);
    const tokens = enc2.encode(full.slice(0, mid)).length;
    if (tokens <= targetTokens) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }
  enc2.free();
  return full.slice(0, lo);
}

// ---------------------------------------------------------------------------
// Single test execution
// ---------------------------------------------------------------------------

export interface TestResult {
  ttftMs: number;
  tps: number;
  totalTokens: number;
}

/**
 * Run a single timed inference, returning TTFT and tokens-per-second.
 * Throws TimeoutError or InferenceOOMError on failure.
 */
export async function runSingleTest(
  modelId: string,
  promptText: string,
  expectedMaxTokens: number,
): Promise<TestResult> {
  const client = new OpenAI({
    baseURL: LMS_BASE_URL,
    apiKey: 'lm-studio',
  });

  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), INFERENCE_TIMEOUT_MS);

  // ----- Warm-up run (discard result) -----
  try {
    const warmupPrompt = generateDummyPrompt(WARMUP_TOKENS);
    await client.chat.completions.create(
      {
        model: modelId,
        messages: [{ role: 'user', content: warmupPrompt }],
        max_tokens: 5,
        stream: false,
      },
      { signal: abortController.signal },
    );
  } catch {
    // Warm-up failures are non-fatal
  }

  // ----- Timed run -----
  const startTime = performance.now();
  let ttftMs = 0;
  let totalTokens = 0;

  try {
    const stream = await client.chat.completions.create(
      {
        model: modelId,
        messages: [{ role: 'user', content: promptText }],
        max_tokens: expectedMaxTokens,
        stream: true,
      },
      { signal: abortController.signal },
    );

    let firstChunk = true;
    for await (const chunk of stream) {
      if (firstChunk) {
        ttftMs = performance.now() - startTime;
        firstChunk = false;
      }
      // Count delta tokens
      const content = chunk.choices?.[0]?.delta?.content;
      if (content) {
        totalTokens += 1; // approximate; full token counting via tiktoken can happen post-hoc
      }
    }
  } catch (err: unknown) {
    const e = err as { name?: string; message?: string; code?: string };
    if (
      e.name === 'AbortError' ||
      (e.message ?? '').includes('abort')
    ) {
      throw new TimeoutError();
    }
    const msg = (e.message ?? '').toLowerCase();
    const code = (e.code ?? '').toLowerCase();
    if (
      msg.includes('connection reset') ||
      msg.includes('econnreset') ||
      code === 'econnreset' ||
      msg.includes('socket hang up') ||
      msg.includes('oom') ||
      msg.includes('out of memory') ||
      msg.includes('tokens to keep from the initial prompt')
    ) {
      throw new InferenceOOMError();
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }

  const endTime = performance.now();
  const elapsedSeconds = (endTime - startTime) / 1000;
  const tps = elapsedSeconds > 0 ? totalTokens / elapsedSeconds : 0;

  return { ttftMs, tps, totalTokens };
}

// ---------------------------------------------------------------------------
// Progress callback types
// ---------------------------------------------------------------------------

export interface ContextProbe {
  contextSize: number;
  tps: number | null;
  passed: boolean;
}

export interface ContextSearchResult {
  maxContext: number;
  probes: ContextProbe[];
}

export interface BenchmarkProgressCallback {
  onContextProbe?: (context: number, status: 'load' | 'test' | 'oom' | 'ok') => void;
  onSpeedTest?: (fraction: number, result: TestResult | null) => void;
  onLog?: (msg: string) => void;
}

// ---------------------------------------------------------------------------
// Binary search for max context
// ---------------------------------------------------------------------------

/**
 * Determine the maximum usable context size for a model using binary search.
 * Returns the discovered max context and all probe results.
 */
export async function findMaxContext(
  modelId: string,
  callbacks: BenchmarkProgressCallback = {},
): Promise<ContextSearchResult> {
  let lo = MIN_CONTEXT;
  let hi = MAX_CONTEXT_GUESS;
  let bestOk = MIN_CONTEXT;
  const probes: ContextProbe[] = [];

  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    callbacks.onLog?.(`[Context Search] Probing ${mid} tokens...`);
    callbacks.onContextProbe?.(mid, 'load');

    // Unload then load at new context size
    await unloadAll();

    let loadOOM = false;
    try {
      await loadModel(modelId, mid);
    } catch (err) {
      if (err instanceof ModelLoadOOMError) {
        loadOOM = true;
      } else {
        throw err;
      }
    }

    if (loadOOM) {
      callbacks.onLog?.(`[Context Search] OOM on load at ${mid}, reducing...`);
      callbacks.onContextProbe?.(mid, 'oom');
      probes.push({ contextSize: mid, tps: null, passed: false });
      hi = mid - 1;
      continue;
    }

    callbacks.onContextProbe?.(mid, 'test');
    const targetTokens = Math.floor(mid * CONTEXT_FILL_RATIO);
    const prompt = generateDummyPrompt(targetTokens);

    let result: TestResult | null = null;
    let inferenceOOM = false;
    try {
      result = await runSingleTest(modelId, prompt, 64);
    } catch (err) {
      if (err instanceof InferenceOOMError || err instanceof TimeoutError) {
        inferenceOOM = true;
      } else {
        throw err;
      }
    }

    if (inferenceOOM || (result !== null && result.tps < MIN_VIABLE_TPS)) {
      const reason = inferenceOOM ? 'OOM during inference' : `TPS too low (${result!.tps.toFixed(1)})`;
      callbacks.onLog?.(`[Context Search] Failed at ${mid}: ${reason}, reducing...`);
      callbacks.onContextProbe?.(mid, 'oom');
      probes.push({ contextSize: mid, tps: inferenceOOM ? null : result!.tps, passed: false });
      hi = mid - 1;
    } else {
      callbacks.onLog?.(`[Context Search] Success at ${mid} (TPS: ${result!.tps.toFixed(1)})`);
      callbacks.onContextProbe?.(mid, 'ok');
      probes.push({ contextSize: mid, tps: result!.tps, passed: true });
      bestOk = mid;
      lo = mid + 1;
    }
  }

  return { maxContext: bestOk, probes };
}

// ---------------------------------------------------------------------------
// Speed benchmarking at multiple context fractions
// ---------------------------------------------------------------------------

/**
 * Run benchmark tests at 25%, 50%, 75%, and 100% of the discovered max context.
 */
export async function benchmarkSpeeds(
  modelId: string,
  actualMaxContext: number,
  callbacks: BenchmarkProgressCallback = {},
): Promise<BenchmarkEntry[]> {
  const results: BenchmarkEntry[] = [];

  for (const fraction of BENCHMARK_FRACTIONS) {
    const contextUsed = Math.max(
      MIN_CONTEXT,
      Math.floor(actualMaxContext * fraction),
    );
    callbacks.onLog?.(`[Speed Test] Testing at ${Math.round(fraction * 100)}% context (${contextUsed} tokens)...`);
    callbacks.onSpeedTest?.(fraction, null);

    // Reload the model at the correct context size for this test fraction.
    // This also allows the server to recover from any prior OOM state.
    await unloadAll();
    try {
      await loadModel(modelId, contextUsed);
    } catch (err) {
      callbacks.onLog?.(`[Speed Test] Load failed at ${contextUsed} tokens: ${String(err)}`);
      continue;
    }

    const targetTokens = Math.floor(contextUsed * CONTEXT_FILL_RATIO);
    const prompt = generateDummyPrompt(targetTokens);

    let testResult: TestResult | null = null;
    try {
      testResult = await runSingleTest(modelId, prompt, 64);
    } catch (err) {
      callbacks.onLog?.(`[Speed Test] Failed at ${contextUsed} tokens: ${String(err)}`);
    }

    if (testResult) {
      callbacks.onSpeedTest?.(fraction, testResult);
      results.push({
        contextUsed,
        ttftMs: Math.round(testResult.ttftMs),
        tps: Math.round(testResult.tps * 10) / 10,
      });
      callbacks.onLog?.(
        `[Speed Test] ${contextUsed} tokens → TTFT: ${Math.round(testResult.ttftMs)}ms, TPS: ${testResult.tps.toFixed(1)}`,
      );
    }
  }

  return results;
}
