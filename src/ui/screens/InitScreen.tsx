import React from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';

interface Props {
  gpuModel?: string;
  gpuVram?: number;
  ramGb?: number;
}

export function InitScreen({ gpuModel, gpuVram, ramGb }: Props): React.ReactElement {
  return (
    <Box flexDirection="column" gap={1}>
      <Box gap={1}>
        <Spinner type="dots" />
        <Text>Detecting Hardware &amp; Waking LM Studio...</Text>
      </Box>
      {gpuModel !== undefined && gpuModel !== '' && (
        <Box flexDirection="column" marginLeft={2}>
          <Text dimColor>GPU: {gpuModel} ({gpuVram} MB VRAM)</Text>
          <Text dimColor>RAM: {ramGb} GB</Text>
        </Box>
      )}
    </Box>
  );
}
