import React, { useEffect, useRef, useState, useCallback } from 'react';
import { View, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import { Text } from '@/components/Text';

interface TimerProps {
  isRunning: boolean;
  startTime?: number | null;
  onTick?: (duration: number) => void;
  style?: StyleProp<ViewStyle>;
  showMilliseconds?: boolean;
}

export const Timer: React.FC<TimerProps> = ({
  isRunning,
  startTime,
  onTick,
  style,
  showMilliseconds = false,
}) => {
  const { theme } = useTheme();
  const [duration, setDuration] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const formatTime = useCallback(
    (ms: number): string => {
      const totalSeconds = Math.floor(ms / 1000);
      const hours = Math.floor(totalSeconds / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      const seconds = totalSeconds % 60;
      const milliseconds = Math.floor((ms % 1000) / 10);

      const pad = (num: number): string => num.toString().padStart(2, '0');

      if (showMilliseconds) {
        return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}.${pad(milliseconds)}`;
      }
      return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
    },
    [showMilliseconds],
  );

  useEffect(() => {
    if (isRunning && startTime) {
      intervalRef.current = setInterval(() => {
        const newDuration = Date.now() - startTime;
        setDuration(newDuration);
        onTick?.(newDuration);
      }, showMilliseconds ? 10 : 100);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if (!isRunning) {
        setDuration(0);
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isRunning, startTime, onTick, showMilliseconds]);

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: theme.colors.surface,
          borderRadius: theme.borderRadius.lg,
          padding: theme.spacing.md,
        },
        style,
      ]}
    >
      <Text
        variant="h1"
        weight="bold"
        align="center"
        style={[
          styles.timerText,
          {
            color: isRunning ? theme.colors.recording : theme.colors.text,
            fontVariant: ['tabular-nums'],
          },
        ]}
      >
        {formatTime(duration)}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  timerText: {
    letterSpacing: 2,
  },
});

export default Timer;

