#!/usr/bin/env node
import React from 'react';
import { render } from 'ink';
import { App } from './ui/App.js';
import { useAppStore } from './ui/store.js';
import { startServer, getModels, unloadAll, unloadAllSync, stopServerSync } from './cli/lms.js';
import { getHardwareInfo, upsertModelSettings } from './utils/config.js';
import {
  findMaxContext,
  benchmarkSpeeds,
} from './core/benchmarker.js';
import type { BenchmarkEntry } from './utils/config.js';

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------

let isShuttingDown = false;
let abortController = new AbortController();

function handleExit(): void {
  if (isShuttingDown) return;
  isShuttingDown = true;

  useAppStore.getState().setShuttingDown(true);

  // Abort any pending OpenAI calls
  abortController.abort();

  // Synchronously clean up LM Studio (sync required: event loop may close)
  unloadAllSync();
  stopServerSync();

  process.stdout.write('\n🧹 Gracefully cleaned up VRAM and stopped LM Studio server.\n');
  process.exit(0);
}

process.on('SIGINT', handleExit);
process.on('SIGTERM', handleExit);
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
  handleExit();
});

// ---------------------------------------------------------------------------
// Benchmarking queue processor
// ---------------------------------------------------------------------------

async function processQueue(selectedIds: string[]): Promise<void> {
  const store = useAppStore.getState();
  const { hardwareFingerprint, cpuModel, gpuModel, gpuVram } = store;

  for (const modelId of selectedIds) {
    if (isShuttingDown) break;

    store.updateLive({
      currentModel: modelId,
      phase: 'context-search',
      progress: 0,
      currentContext: 0,
      currentTtft: 0,
      currentTps: 0,
    });

    store.appendLog(`Starting benchmark for: ${modelId}`);
    useAppStore.getState().setScreen('benchmarking');

    let maxContext = 2048;

    // ----- Binary search for max context -----
    try {
      const contextResult = await findMaxContext(modelId, {
        onContextProbe: (context, status) => {
          if (isShuttingDown) return;
          const progressMap = { load: 10, test: 30, oom: 5, ok: 50 };
          useAppStore.getState().updateLive({
            currentContext: context,
            progress: Math.min(49, progressMap[status] ?? 10),
          });
        },
        onLog: (msg) => {
          if (isShuttingDown) return;
          useAppStore.getState().appendLog(msg);
        },
      });
      maxContext = contextResult.maxContext;

      useAppStore.getState().appendLog(`Max context found: ${maxContext} tokens`);
    } catch (err) {
      useAppStore.getState().appendLog(`Error finding max context for ${modelId}: ${String(err)}`);
      // Continue with minimum context
    }

    if (isShuttingDown) break;

    // ----- Speed benchmarks -----
    useAppStore.getState().updateLive({
      phase: 'speed-test',
      progress: 50,
    });

    let benchmarks: BenchmarkEntry[] = [];

    try {
      benchmarks = await benchmarkSpeeds(modelId, maxContext, {
        onSpeedTest: (fraction, result) => {
          if (isShuttingDown) return;
          const progress = 50 + Math.round(fraction * 50);
          useAppStore.getState().updateLive({
            progress,
            currentContext: Math.floor(maxContext * fraction),
            currentTtft: result ? result.ttftMs : 0,
            currentTps: result ? result.tps : 0,
          });
        },
        onLog: (msg) => {
          if (isShuttingDown) return;
          useAppStore.getState().appendLog(msg);
        },
      });
    } catch (err) {
      useAppStore.getState().appendLog(`Error in speed benchmark for ${modelId}: ${String(err)}`);
    }

    if (isShuttingDown) break;

    // ----- Save intermediate results immediately -----
    const modelSettings = {
      modelId,
      hardwareFingerprint,
      maxContext,
      benchmarks,
    };

    try {
      upsertModelSettings(modelSettings);
    } catch (err) {
      useAppStore.getState().appendLog(`Warning: failed to save settings: ${String(err)}`);
    }

    useAppStore.getState().addCompletedModel(modelSettings);
    useAppStore.getState().updateLive({ phase: 'done', progress: 100 });
    useAppStore.getState().appendLog(`✓ Finished: ${modelId}`);
  }

  // Unload all models after queue completes
  if (!isShuttingDown) {
    await unloadAll();
    useAppStore.getState().setScreen('summary');
  }
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const store = useAppStore.getState();

  // Render the Ink app; pass the callback for model selection confirmation
  let resolveModelSelection: (ids: string[]) => void = () => {};
  const modelSelectionPromise = new Promise<string[]>((resolve) => {
    resolveModelSelection = resolve;
  });

  const { unmount } = render(
    React.createElement(App, {
      onModelSelectConfirmed: (ids: string[]) => {
        resolveModelSelection(ids);
      },
    }),
    { exitOnCtrlC: false },
  );

  // Wire Ctrl+C to graceful shutdown while Ink is running
  process.on('SIGINT', handleExit);

  try {
    // ----- Phase: init — detect hardware and start server -----
    store.setScreen('init');

    const [hardwareInfo] = await Promise.all([
      getHardwareInfo(),
      startServer(),
    ]);

    store.setHardware(hardwareInfo);

    // Discover models
    let models: Awaited<ReturnType<typeof getModels>> = [];
    try {
      models = await getModels();
    } catch (err) {
      store.appendLog(`Warning: Could not list models: ${String(err)}`);
    }

    store.setModels(models);
    store.setScreen('model-select');

    // ----- Phase: wait for user to select models -----
    const selectedIds = await modelSelectionPromise;

    if (selectedIds.length === 0) {
      unmount();
      return;
    }

    // ----- Phase: run benchmark queue -----
    await processQueue(selectedIds);
  } catch (err) {
    console.error('Fatal error:', err);
    handleExit();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
