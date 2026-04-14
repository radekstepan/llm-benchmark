import { execa, execaSync } from 'execa';

/**
 * Custom errors for LM Studio CLI interactions.
 */
export class ModelLoadOOMError extends Error {
  constructor(modelId: string) {
    super(`Out of memory when loading model: ${modelId}`);
    this.name = 'ModelLoadOOMError';
  }
}

export class ModelNotFoundError extends Error {
  constructor(modelId: string) {
    super(`Model not found: ${modelId}`);
    this.name = 'ModelNotFoundError';
  }
}

export interface ModelInfo {
  id: string;
  name: string;
  sizeBytes: number;
}

const LMS_SERVER_URL = 'http://localhost:1234/v1/models';
const SERVER_POLL_INTERVAL_MS = 1000;
const SERVER_POLL_TIMEOUT_MS = 30_000;

/**
 * Poll LM Studio server until it returns 200 OK, up to timeout.
 */
async function waitForServer(
  timeoutMs = SERVER_POLL_TIMEOUT_MS,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(LMS_SERVER_URL);
      if (response.ok) return;
    } catch {
      // not ready yet
    }
    await new Promise((res) => setTimeout(res, SERVER_POLL_INTERVAL_MS));
  }
  throw new Error('LM Studio server did not become ready within timeout');
}

/**
 * Start the LM Studio server and wait until it is ready.
 */
export async function startServer(): Promise<void> {
  try {
    await execa('lms', ['server', 'start']);
  } catch {
    // may already be running; proceed to poll
  }
  await waitForServer();
}

/**
 * Stop the LM Studio server.
 */
export async function stopServer(): Promise<void> {
  try {
    await execa('lms', ['server', 'stop']);
  } catch {
    // best-effort
  }
}

/**
 * Stop the LM Studio server synchronously (for use in exit handlers).
 */
export function stopServerSync(): void {
  try {
    execaSync('lms', ['server', 'stop']);
  } catch {
    // best-effort
  }
}

/**
 * Discover all models known to LM Studio.
 */
export async function getModels(): Promise<ModelInfo[]> {
  let stdout: string;
  try {
    const result = await execa('lms', ['ls', '--json']);
    stdout = result.stdout;
  } catch (err: unknown) {
    const e = err as { stderr?: string };
    throw new Error(`Failed to list models: ${e.stderr ?? String(err)}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    throw new Error('Failed to parse lms ls --json output');
  }

  if (!Array.isArray(parsed)) {
    throw new Error('Unexpected lms ls output shape');
  }

  return parsed.map((entry: Record<string, unknown>) => ({
    id: String(entry.modelKey ?? entry.id ?? entry.path ?? ''),
    name: String(entry.displayName ?? entry.name ?? entry.id ?? ''),
    sizeBytes: typeof entry.sizeBytes === 'number' ? entry.sizeBytes : 0,
  }));
}

/**
 * Load a model at a specific context size.
 * Throws ModelLoadOOMError or ModelNotFoundError on specific failures.
 */
export async function loadModel(
  modelId: string,
  contextSize: number,
): Promise<void> {
  try {
    await execa('lms', [
      'load',
      modelId,
      '--gpu=max',
      `--context-length=${contextSize}`,
      '--yes',
    ]);
  } catch (err: unknown) {
    const e = err as { stderr?: string; message?: string };
    const stderr = (e.stderr ?? e.message ?? '').toLowerCase();
    if (
      stderr.includes('out of memory') ||
      stderr.includes('oom') ||
      stderr.includes('allocation failed') ||
      stderr.includes('failed to allocate') ||
      stderr.includes('not enough memory')
    ) {
      throw new ModelLoadOOMError(modelId);
    }
    if (stderr.includes('not found')) {
      throw new ModelNotFoundError(modelId);
    }
    throw new Error(`Failed to load model ${modelId}: ${stderr}`);
  }
}

/**
 * Unload all currently loaded models.
 */
export async function unloadAll(): Promise<void> {
  try {
    await execa('lms', ['unload', '--all']);
  } catch {
    // best-effort
  }
}

/**
 * Unload all models synchronously (for use in exit handlers).
 */
export function unloadAllSync(): void {
  try {
    execaSync('lms', ['unload', '--all']);
  } catch {
    // best-effort
  }
}
