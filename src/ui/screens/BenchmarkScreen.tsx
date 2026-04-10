import React from 'react';
import { Box, Text } from 'ink';
import type { LiveBenchmarkState } from '../store.js';

const BAR_WIDTH = 20;

function renderProgressBar(percent: number): string {
  const filled = Math.round((percent / 100) * BAR_WIDTH);
  const empty = BAR_WIDTH - filled;
  return `[${'█'.repeat(filled)}${'░'.repeat(empty)}] ${percent}%`;
}

interface Props {
  live: LiveBenchmarkState;
  totalModels: number;
  doneModels: number;
}

export function BenchmarkScreen({
  live,
  totalModels,
  doneModels,
}: Props): React.ReactElement {
  const recentLogs = live.logs.slice(-5);

  return (
    <Box flexDirection="column" gap={1}>
      {/* Header */}
      <Box gap={1}>
        <Text bold color="green">
          Benchmarking:
        </Text>
        <Text bold>{live.currentModel}</Text>
        <Text dimColor>
          ({doneModels}/{totalModels})
        </Text>
      </Box>

      {/* Phase label */}
      <Text dimColor>
        Phase:{' '}
        {live.phase === 'context-search'
          ? 'Context Range Search'
          : live.phase === 'speed-test'
          ? 'Speed Benchmark'
          : 'Complete'}
      </Text>

      {/* Progress bar */}
      <Text>{renderProgressBar(live.progress)}</Text>

      {/* Live metrics */}
      <Box gap={2}>
        <Text>
          Context: <Text bold>{live.currentContext > 0 ? `${live.currentContext}` : '–'}</Text>
        </Text>
        <Text>
          TTFT: <Text bold>{live.currentTtft > 0 ? `${live.currentTtft}ms` : '–'}</Text>
        </Text>
        <Text>
          Speed: <Text bold>{live.currentTps > 0 ? `${live.currentTps.toFixed(1)} tok/s` : '–'}</Text>
        </Text>
      </Box>

      {/* Recent logs */}
      <Box flexDirection="column" marginTop={1}>
        <Text dimColor>─── Logs ───</Text>
        {recentLogs.map((log, i) => (
          <Text key={i} dimColor>
            {log}
          </Text>
        ))}
      </Box>
    </Box>
  );
}
