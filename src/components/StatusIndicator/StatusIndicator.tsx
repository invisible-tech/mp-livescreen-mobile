import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, StyleProp, ViewStyle } from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import { Text } from '@/components/Text';
import { RecordingStatus } from '@/types';

interface StatusIndicatorProps {
  status: RecordingStatus;
  style?: StyleProp<ViewStyle>;
}

const statusConfig: Record<
  RecordingStatus,
  { label: string; colorKey: keyof ReturnType<typeof useTheme>['theme']['colors'] }
> = {
  [RecordingStatus.IDLE]: { label: 'Ready', colorKey: 'textSecondary' },
  [RecordingStatus.PREPARING]: { label: 'Preparing...', colorKey: 'warning' },
  [RecordingStatus.RECORDING]: { label: 'Recording', colorKey: 'recording' },
  [RecordingStatus.STOPPING]: { label: 'Stopping...', colorKey: 'warning' },
  [RecordingStatus.ERROR]: { label: 'Error', colorKey: 'error' },
};

export const StatusIndicator: React.FC<StatusIndicatorProps> = ({ status, style }) => {
  const { theme } = useTheme();
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (status === RecordingStatus.RECORDING) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 0.3,
            duration: 800,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 800,
            useNativeDriver: true,
          }),
        ]),
      );
      pulse.start();

      return () => pulse.stop();
    }
    
    pulseAnim.setValue(1);
    return undefined;
  }, [status, pulseAnim]);

  const config = statusConfig[status];
  const color = theme.colors[config.colorKey];

  return (
    <View style={[styles.container, style]}>
      <Animated.View
        style={[
          styles.dot,
          {
            backgroundColor: color,
            opacity: status === RecordingStatus.RECORDING ? pulseAnim : 1,
          },
        ]}
      />
      <Text variant="bodySmall" weight="medium" color={color}>
        {config.label}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
  },
});

export default StatusIndicator;

