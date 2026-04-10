import React from 'react';
import { Box, Text, useInput } from 'ink';
import { useState } from 'react';
import type { ModelInfo } from '../../cli/lms.js';

interface Props {
  models: ModelInfo[];
  onConfirm: (selectedIds: string[]) => void;
}

export function ModelSelectScreen({ models, onConfirm }: Props): React.ReactElement {
  const [activeIndex, setActiveIndex] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useInput((input, key) => {
    if (key.upArrow) {
      setActiveIndex((i) => Math.max(0, i - 1));
    } else if (key.downArrow) {
      setActiveIndex((i) => Math.min(models.length - 1, i + 1));
    } else if (key.return) {
      if (selected.size > 0) {
        onConfirm(Array.from(selected));
      }
    } else if (input === ' ') {
      const modelId = models[activeIndex]?.id;
      if (modelId !== undefined) {
        setSelected((prev) => {
          const next = new Set(prev);
          if (next.has(modelId)) {
            next.delete(modelId);
          } else {
            next.add(modelId);
          }
          return next;
        });
      }
    }
  });

  return (
    <Box flexDirection="column" gap={1}>
      <Text bold>Select models to benchmark:</Text>
      <Text dimColor>↑/↓ to navigate · Space to toggle · Enter to start</Text>
      <Box flexDirection="column">
        {models.map((model, index) => {
          const isActive = index === activeIndex;
          const isSelected = selected.has(model.id);
          const checkbox = isSelected ? '[✓]' : '[ ]';
          const sizeMb =
            model.sizeBytes > 0
              ? ` (${(model.sizeBytes / 1_073_741_824).toFixed(1)} GB)`
              : '';
          return (
            <Box key={model.id} gap={1}>
              <Text color={isActive ? 'cyan' : undefined} bold={isActive}>
                {isActive ? '▶' : ' '}
              </Text>
              <Text color={isSelected ? 'green' : 'white'}>{checkbox}</Text>
              <Text color={isActive ? 'cyan' : 'white'}>
                {model.name}
                {sizeMb}
              </Text>
            </Box>
          );
        })}
      </Box>
      {selected.size > 0 && (
        <Text color="green">
          {selected.size} model{selected.size > 1 ? 's' : ''} selected — press Enter to begin
        </Text>
      )}
      {models.length === 0 && (
        <Text color="yellow">No models found. Make sure LM Studio has models downloaded.</Text>
      )}
    </Box>
  );
}
