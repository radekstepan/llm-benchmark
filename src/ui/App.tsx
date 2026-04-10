import React, { useEffect } from 'react';
import { Box } from 'ink';
import { useAppStore } from './store.js';
import { InitScreen } from './screens/InitScreen.js';
import { ModelSelectScreen } from './screens/ModelSelectScreen.js';
import { BenchmarkScreen } from './screens/BenchmarkScreen.js';
import { SummaryScreen } from './screens/SummaryScreen.js';

interface Props {
  onModelSelectConfirmed: (ids: string[]) => void;
}

export function App({ onModelSelectConfirmed }: Props): React.ReactElement {
  const {
    screen,
    models,
    live,
    completedModels,
    cpuModel,
    gpuModel,
    gpuVram,
    ramGb,
  } = useAppStore();

  return (
    <Box flexDirection="column" padding={1}>
      {screen === 'init' && (
        <InitScreen
          gpuModel={gpuModel}
          gpuVram={gpuVram}
          ramGb={ramGb}
        />
      )}

      {screen === 'model-select' && (
        <ModelSelectScreen
          models={models}
          onConfirm={onModelSelectConfirmed}
        />
      )}

      {screen === 'benchmarking' && (
        <BenchmarkScreen
          live={live}
          totalModels={models.length}
          doneModels={completedModels.length}
        />
      )}

      {screen === 'summary' && (
        <SummaryScreen
          completedModels={completedModels}
          hardwareInfo={{ cpuModel, gpuModel, gpuVram }}
        />
      )}
    </Box>
  );
}
