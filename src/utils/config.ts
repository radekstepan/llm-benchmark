import { z } from 'zod';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import si from 'systeminformation';

// ---------------------------------------------------------------------------
// Zod Schemas
// ---------------------------------------------------------------------------

export const BenchmarkEntrySchema = z.object({
  contextUsed: z.number(),
  ttftMs: z.number(),
  tps: z.number(),
});

export const ContextProbeSchema = z.object({
  contextSize: z.number(),
  tps: z.number().nullable(),
  passed: z.boolean(),
});

export const ModelSettingsSchema = z.object({
  modelId: z.string(),
  hardwareFingerprint: z.string(),
  hardwareInfo: z.object({
    cpu: z.string(),
    gpu: z.string(),
    ramGb: z.number(),
  }).optional(),
  maxContext: z.number(),
  contextProbes: z.array(ContextProbeSchema).optional(),
  benchmarks: z.array(BenchmarkEntrySchema),
});

export const SettingsFileSchema = z.object({
  models: z.array(ModelSettingsSchema),
});

export type BenchmarkEntry = z.infer<typeof BenchmarkEntrySchema>;
export type ModelSettings = z.infer<typeof ModelSettingsSchema>;
export type SettingsFile = z.infer<typeof SettingsFileSchema>;

// ---------------------------------------------------------------------------
// Hardware Fingerprint
// ---------------------------------------------------------------------------

export interface HardwareInfo {
  fingerprint: string;
  cpuModel: string;
  gpuModel: string;
  gpuVram: number;
  ramGb: number;
}

export async function getHardwareInfo(): Promise<HardwareInfo> {
  const [cpu, mem, graphics] = await Promise.all([
    si.cpu(),
    si.mem(),
    si.graphics(),
  ]);

  const primaryGpu = graphics.controllers?.[0];
  const gpuModel = primaryGpu?.model ?? 'unknown';
  const gpuVram = primaryGpu?.vram ?? 0;
  const cpuModel = `${cpu.manufacturer} ${cpu.brand}`;
  const ramGb = Math.round((mem.total ?? 0) / 1_073_741_824);

  const fingerprint = createHash('sha256')
    .update(`${cpuModel}|${ramGb}|${gpuVram}`)
    .digest('hex')
    .slice(0, 16);

  return { fingerprint, cpuModel, gpuModel, gpuVram, ramGb };
}

// ---------------------------------------------------------------------------
// File I/O
// ---------------------------------------------------------------------------

const SETTINGS_FILE = 'results/benchmarks.json';
const SETTINGS_TMP = 'results/benchmarks.json.tmp';

function resolveSettingsPath(): string {
  const dir = join(process.cwd(), 'results');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return join(process.cwd(), SETTINGS_FILE);
}

function resolveTmpPath(): string {
  return join(process.cwd(), SETTINGS_TMP);
}

export function loadSettings(): SettingsFile {
  const filePath = resolveSettingsPath();
  if (!existsSync(filePath)) {
    return { models: [] };
  }
  try {
    const raw = readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw);
    return SettingsFileSchema.parse(parsed);
  } catch {
    // If corrupted/unreadable, start fresh
    return { models: [] };
  }
}

export function saveSettings(data: SettingsFile): void {
  const validated = SettingsFileSchema.parse(data);
  const tmpPath = resolveTmpPath();
  const finalPath = resolveSettingsPath();

  // Atomic write: write to .tmp then rename
  writeFileSync(tmpPath, JSON.stringify(validated, null, 2), 'utf-8');
  renameSync(tmpPath, finalPath);
}

/**
 * Upsert model settings, merging by modelId + hardwareFingerprint.
 */
export function upsertModelSettings(newEntry: ModelSettings): void {
  const settings = loadSettings();
  const idx = settings.models.findIndex(
    (m) =>
      m.modelId === newEntry.modelId &&
      m.hardwareFingerprint === newEntry.hardwareFingerprint,
  );
  if (idx >= 0) {
    settings.models[idx] = newEntry;
  } else {
    settings.models.push(newEntry);
  }
  saveSettings(settings);
}
