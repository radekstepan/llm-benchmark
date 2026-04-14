#!/usr/bin/env node
/**
 * Headless benchmark harness — runs a single model end-to-end with no TUI.
 * Usage: node dist/bench.js <modelId>
 */
import { startServer, getModels, unloadAll, unloadAllSync, stopServerSync } from './cli/lms.js';
import { getHardwareInfo, upsertModelSettings } from './utils/config.js';
import { findMaxContext, benchmarkSpeeds } from './core/benchmarker.js';
import { ModelLoadOOMError, ModelNotFoundError } from './cli/lms.js';

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------

let isShuttingDown = false;

function handleExit(): void {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log('\n🧹 Cleaning up — unloading models and stopping server...');
  unloadAllSync();
  stopServerSync();
  process.exit(0);
}

process.on('SIGINT', handleExit);
process.on('SIGTERM', handleExit);
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
  handleExit();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function log(msg: string): void {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] ${msg}`);
}

function bar(progress: number, width = 30): string {
  const filled = Math.round((progress / 100) * width);
  return '[' + '█'.repeat(filled) + '░'.repeat(width - filled) + `] ${progress}%`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const modelId = process.argv[2];
  if (!modelId) {
    console.error('Usage: node dist/bench.js <modelId>');
    process.exit(1);
  }

  console.log('');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`  LLM Benchmark — ${modelId}`);
  console.log('═══════════════════════════════════════════════════════');
  console.log('');

  // ── 1. Hardware ──────────────────────────────────────────────────────────
  log('Gathering hardware info...');
  const hw = await getHardwareInfo();
  console.log(`  CPU  : ${hw.cpuModel}`);
  console.log(`  GPU  : ${hw.gpuModel} (${hw.gpuVram} MB VRAM)`);
  console.log(`  RAM  : ${hw.ramGb} GB`);
  console.log(`  FP   : ${hw.fingerprint}`);
  console.log('');

  // ── 2. Server ────────────────────────────────────────────────────────────
  log('Starting / confirming LM Studio server...');
  try {
    await startServer();
    log('Server is ready.');
  } catch (err) {
    console.error('Failed to start LM Studio server:', err);
    process.exit(1);
  }

  // ── 3. Verify model exists ───────────────────────────────────────────────
  log('Verifying model is available...');
  let models: Awaited<ReturnType<typeof getModels>>;
  try {
    models = await getModels();
  } catch (err) {
    console.error('Failed to list models:', err);
    process.exit(1);
  }

  const found = models.find((m) => m.id === modelId);
  if (!found) {
    console.error(`Model "${modelId}" not found in LM Studio.`);
    console.error('Available models:');
    models.forEach((m) => console.error(`  - ${m.id}`));
    process.exit(1);
  }
  log(`Found model: ${found.name} (${(found.sizeBytes / 1e9).toFixed(2)} GB)`);
  console.log('');

  // ── 4. Binary search for max context ────────────────────────────────────
  console.log('──────────────────────────────────────────────────────');
  console.log('  Phase 1: Context Window Search (binary search)');
  console.log('──────────────────────────────────────────────────────');

  let maxContext = 2048;
  let contextProbes: Awaited<ReturnType<typeof findMaxContext>>['probes'] = [];
  try {
    const contextResult = await findMaxContext(modelId, {
      onContextProbe: (context, status) => {
        const icon = status === 'ok' ? '✓' : status === 'oom' ? '✗' : '↻';
        process.stdout.write(`\r  ${icon} Context probe: ${context.toString().padEnd(6)} [${status.padEnd(4)}]  `);
        if (status === 'ok' || status === 'oom') process.stdout.write('\n');
      },
      onLog: (msg) => log(msg),
    });
    maxContext = contextResult.maxContext;
    contextProbes = contextResult.probes;
    console.log('');
    log(`✓ Max context found: ${maxContext} tokens`);
  } catch (err) {
    if (err instanceof ModelNotFoundError) {
      console.error(`Model not found during load: ${err.message}`);
      process.exit(1);
    }
    if (err instanceof ModelLoadOOMError) {
      log(`OOM at minimum context — using ${maxContext} tokens`);
    } else {
      log(`Error during context search: ${String(err)} — using ${maxContext} tokens`);
    }
  }

  if (isShuttingDown) return;
  console.log('');

  // ── 5. Speed benchmarks ──────────────────────────────────────────────────
  console.log('──────────────────────────────────────────────────────');
  console.log('  Phase 2: Speed Benchmarks (25/50/75/100% of context)');
  console.log('──────────────────────────────────────────────────────');

  let benchmarks: Awaited<ReturnType<typeof benchmarkSpeeds>> = [];
  try {
    benchmarks = await benchmarkSpeeds(modelId, maxContext, {
      onSpeedTest: (fraction, result) => {
        const pct = Math.round(fraction * 100);
        const ctx = Math.floor(maxContext * fraction);
        if (result) {
          log(`  ${bar(pct, 20)}  ${ctx} tokens → TTFT: ${Math.round(result.ttftMs)}ms  TPS: ${result.tps.toFixed(1)}`);
        } else {
          process.stdout.write(`\r  Testing at ${pct}% context (${ctx} tokens)...`);
        }
      },
      onLog: (msg) => log(msg),
    });
    console.log('');
  } catch (err) {
    log(`Error during speed benchmarks: ${String(err)}`);
  }

  if (isShuttingDown) return;

  // ── 6. Save results ───────────────────────────────────────────────────────
  const entry = {
    modelId,
    hardwareFingerprint: hw.fingerprint,
    hardwareInfo: {
      cpu: hw.cpuModel,
      gpu: hw.gpuModel,
      ramGb: hw.ramGb,
      gpuVram: hw.gpuVram,
    },
    maxContext,
    contextProbes,
    benchmarks,
  };

  try {
    upsertModelSettings(entry);
    log('Results saved to results/benchmarks.json');
  } catch (err) {
    log(`Warning: could not save results: ${String(err)}`);
  }

  // ── 7. Summary ────────────────────────────────────────────────────────────
  console.log('');
  console.log('═══════════════════════════════════════════════════════');
  console.log('  Results Summary');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`  Model      : ${modelId}`);
  console.log(`  Max Context: ${maxContext} tokens`);
  console.log('');
  if (benchmarks.length > 0) {
    console.log('  Context    | TTFT (ms) | TPS');
    console.log('  -----------+-----------+----------');
    for (const b of benchmarks) {
      console.log(
        `  ${String(b.contextUsed).padEnd(10)} | ${String(b.ttftMs).padEnd(9)} | ${b.tps.toFixed(1)}`,
      );
    }
  } else {
    console.log('  No speed benchmark data collected.');
  }
  console.log('');
  console.log('═══════════════════════════════════════════════════════');

  // ── 8. Cleanup ────────────────────────────────────────────────────────────
  log('Unloading all models...');
  await unloadAll();
  log('Done.');
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  handleExit();
});
