import React from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import type { ModelSettings } from '../../utils/config.js';

interface Props {
  completedModels: ModelSettings[];
  hardwareInfo: {
    cpuModel: string;
    gpuModel: string;
    gpuVram: number;
  };
}

export function SummaryScreen({ completedModels, hardwareInfo }: Props): React.ReactElement {
  const { exit } = useApp();

  useInput((input, key) => {
    if (input === 'q' || input === 'Q' || key.escape) {
      exit();
    }
  });

  return (
    <Box flexDirection="column" gap={1}>
      <Text bold color="green">
        ✓ Benchmarking Complete
      </Text>

      <Box flexDirection="column" marginBottom={1}>
        <Text dimColor>Hardware: {hardwareInfo.cpuModel}</Text>
        <Text dimColor>
          GPU: {hardwareInfo.gpuModel} ({hardwareInfo.gpuVram} MB VRAM)
        </Text>
      </Box>

      {completedModels.map((model) => (
        <Box key={model.modelId} flexDirection="column" marginBottom={1}>
          <Text bold color="cyan">
            {model.modelId}
          </Text>
          <Text>Max Context: {model.maxContext.toLocaleString()} tokens</Text>
          <Box flexDirection="column" marginLeft={2}>
            {model.benchmarks.map((b, i) => (
              <Box key={i} gap={2}>
                <Text dimColor>@{b.contextUsed.toLocaleString()} tokens</Text>
                <Text>TTFT: {b.ttftMs}ms</Text>
                <Text>TPS: {b.tps.toFixed(1)}</Text>
              </Box>
            ))}
            {model.benchmarks.length === 0 && (
              <Text color="yellow">No successful benchmarks recorded</Text>
            )}
          </Box>
        </Box>
      ))}

      {completedModels.length === 0 && (
        <Text color="yellow">No models were successfully benchmarked.</Text>
      )}

      <Box marginTop={1}>
        <Text dimColor>Results saved to benchmark-settings.json</Text>
      </Box>

      <Text>
        Press <Text bold color="cyan">[Q]</Text> or{' '}
        <Text bold color="cyan">[Ctrl+C]</Text> to exit.
      </Text>
    </Box>
  );
}
