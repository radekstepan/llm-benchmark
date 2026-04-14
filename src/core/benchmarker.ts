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
const INFERENCE_BASE_TIMEOUT_MS = 120_000;
/** Extra timeout per 1k context tokens to account for quadratic TTFT growth. */
const INFERENCE_TIMEOUT_PER_1K_CONTEXT_MS = 5_000;
const MIN_CONTEXT = 2048;
const MAX_CONTEXT_GUESS = 32_768;
const MIN_VIABLE_TPS = 2.0;
/** Stop binary search when remaining range is smaller than this (tokens). */
const CONTEXT_SEARCH_TOLERANCE = 512;
const BENCHMARK_FRACTIONS = [0.25, 0.5, 0.75, 1.0];
const EXPECTED_OUTPUT_TOKENS = 2500; // Your generous Thinking + Answer budget
const SYSTEM_PROMPT_TOKENS = 500;
/** Extra headroom for chat template overhead, instruction suffix, tokenizer mismatch. */
const PROMPT_OVERHEAD_TOKENS = 256;

/** Tokens to generate during context probes (keep small to avoid timeouts). */
const PROBE_OUTPUT_TOKENS = 50;
/** Timeout for context probes (seconds). */
const PROBE_TIMEOUT_MS = 90_000;

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
// Lightweight context probe (for binary search only)
// ---------------------------------------------------------------------------

/**
 * Quick inference check: fill context with a prompt, generate a few tokens.
 * No warmup, small output — just verifies the model can run at this context.
 */
async function probeContext(
  modelId: string,
  promptText: string,
): Promise<TestResult> {
  const client = new OpenAI({
    baseURL: LMS_BASE_URL,
    apiKey: 'lm-studio',
  });

  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), PROBE_TIMEOUT_MS);

  const startTime = performance.now();
  let ttftMs = 0;
  let totalTokens = 0;

  try {
    const stream = await client.completions.create(
      {
        model: modelId,
        prompt: promptText,
        max_tokens: PROBE_OUTPUT_TOKENS,
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
      // Use raw text completions
      if (chunk.choices?.[0]?.text) {
        totalTokens += 1;
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
  // Measure generation speed excluding TTFT — with only ~50 output tokens,
  // TTFT would dominate and make TPS artificially low.
  const generationMs = endTime - startTime - ttftMs;
  const generationSeconds = generationMs / 1000;
  const tps = generationSeconds > 0 ? totalTokens / generationSeconds : 0;

  return { ttftMs, tps, totalTokens };
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
  timeoutMs?: number,
): Promise<TestResult> {
  const client = new OpenAI({
    baseURL: LMS_BASE_URL,
    apiKey: 'lm-studio',
  });

  const effectiveTimeout = timeoutMs ?? INFERENCE_BASE_TIMEOUT_MS;
  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), effectiveTimeout);

  // ----- Warm-up run (discard result) -----
  try {
    const warmupPrompt = generateDummyPrompt(WARMUP_TOKENS);
    await client.completions.create(
      {
        model: modelId,
        prompt: warmupPrompt,
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
    const stream = await client.completions.create(
      {
        model: modelId,
        prompt: promptText,
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
      if (chunk.choices?.[0]?.text) {
        totalTokens += 1;
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
    if (hi - lo < CONTEXT_SEARCH_TOLERANCE) break;
    const mid = Math.floor((lo + hi) / 2);
    callbacks.onLog?.(`[Context Search] Probing ${mid} tokens...`);
    callbacks.onContextProbe?.(mid, 'load');

    // Unload then load at new context size
    await unloadAll();
    // Add a 1 second delay to ensure VRAM is garbage collected by the OS
    await new Promise(r => setTimeout(r, 1000));

    let loadFailed = false;
    try {
      await loadModel(modelId, mid);
    } catch (err) {
      // Treat ANY load failure (OOM, architecture context limit, generic error)
      // as a failed probe so we binary search downwards instead of crashing.
      loadFailed = true;
      callbacks.onLog?.(`[Context Search] Load failed at ${mid}, reducing...`);
    }

    if (loadFailed) {
      callbacks.onContextProbe?.(mid, 'oom');
      probes.push({ contextSize: mid, tps: null, passed: false });
      hi = mid - 1;
      continue;
    }

    // 1. Calculate how much room is actually left for the transcript
    // Apply a 0.8 safety factor because cl100k_base underestimates tokens for exotic models
    const transcriptRoom = Math.floor((mid - PROBE_OUTPUT_TOKENS) * 0.8);

    if (transcriptRoom <= 0) {
      // If the context is so small we can't even fit the output, fail it.
      callbacks.onContextProbe?.(mid, 'oom');
      probes.push({ contextSize: mid, tps: null, passed: false });
      hi = mid - 1;
      continue;
    }

    callbacks.onContextProbe?.(mid, 'test');
    const prompt = generateDummyPrompt(transcriptRoom);

    let result: TestResult | null = null;
    let inferenceFailed = false;
    try {
      result = await probeContext(modelId, prompt);
    } catch (err) {
      // Catch any inference failure to gracefully search downwards
      inferenceFailed = true;
    }

    if (inferenceFailed || (result !== null && result.tps < MIN_VIABLE_TPS)) {
      const reason = inferenceFailed ? 'Failed during inference' : `TPS too low (${result!.tps.toFixed(1)})`;
      callbacks.onLog?.(`[Context Search] Failed at ${mid}: ${reason}, reducing...`);
      callbacks.onContextProbe?.(mid, 'oom');
      probes.push({ contextSize: mid, tps: inferenceFailed ? null : result!.tps, passed: false });
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

  // Load the model ONCE for all speed tests at the maximum discovered context
  callbacks.onLog?.(`[Speed Test] Loading model once at max context (${actualMaxContext})...`);
  await unloadAll();
  await new Promise(r => setTimeout(r, 1000));
  try {
    await loadModel(modelId, actualMaxContext);
  } catch (err) {
    callbacks.onLog?.(`[Speed Test] FATAL: Could not load model for speed tests: ${String(err)}`);
    return [];
  }

  for (const fraction of BENCHMARK_FRACTIONS) {
    const contextUsed = Math.max(256, Math.floor(actualMaxContext * fraction));
    callbacks.onLog?.(`[Speed Test] Testing at ${Math.round(fraction * 100)}% context (${contextUsed} tokens)...`);
    callbacks.onSpeedTest?.(fraction, null);

    const maxOutputTokens = Math.min(
      EXPECTED_OUTPUT_TOKENS,
      Math.max(100, Math.floor(contextUsed * 0.2)),
    );

    // Safety factor for tokenizers
    const transcriptRoom = Math.floor((contextUsed - maxOutputTokens) * 0.8);

    if (transcriptRoom <= 0) {
      callbacks.onLog?.(`[Speed Test] Skipped at ${contextUsed} tokens: Not enough room for output`);
      continue;
    }

    const prompt = generateDummyPrompt(transcriptRoom);
    // Open-ended prompt ensures even pure base models will naturally generate output
    const forcedRamblePrompt = prompt + `\n\nFurthermore, the most critical aspect of this theory is that`;

    const timeoutMs = INFERENCE_BASE_TIMEOUT_MS + Math.ceil(contextUsed / 1024) * INFERENCE_TIMEOUT_PER_1K_CONTEXT_MS;

    let success = false;
    const maxAttempts = 3;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      if (attempt > 1) {
        callbacks.onLog?.(`[Speed Test] Retrying ${contextUsed} tokens (Attempt ${attempt}/${maxAttempts})...`);
        await new Promise(r => setTimeout(r, 2000));
      }

      let testResult: TestResult | null = null;
      try {
        testResult = await runSingleTest(modelId, forcedRamblePrompt, maxOutputTokens, timeoutMs);
      } catch (err) {
        callbacks.onLog?.(`[Speed Test] Run failed at ${contextUsed}: ${String(err)}`);
        continue;
      }

      if (testResult && testResult.totalTokens > 0) {
        success = true;
        callbacks.onSpeedTest?.(fraction, testResult);
        results.push({
          contextUsed,
          ttftMs: Math.round(testResult.ttftMs),
          tps: Math.round(testResult.tps * 10) / 10,
        });
        callbacks.onLog?.(
          `[Speed Test] ${contextUsed} tokens → TTFT: ${Math.round(testResult.ttftMs)}ms, TPS: ${testResult.tps.toFixed(1)}`,
        );
        break;
      } else {
        callbacks.onLog?.(`[Speed Test] Run at ${contextUsed} produced 0 tokens.`);
      }
    }

    if (!success) {
      callbacks.onLog?.(`[Speed Test] Could not complete benchmark for ${contextUsed} tokens after ${maxAttempts} attempts.`);
    }
  }

  return results;
}
