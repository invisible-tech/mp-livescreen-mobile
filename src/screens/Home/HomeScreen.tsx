import React, { useCallback } from 'react';
import { View, StyleSheet, Alert, Platform } from 'react-native';
import { Container, Button, Text, Timer, StatusIndicator, BroadcastPicker } from '@/components';
import { useTheme } from '@/context/ThemeContext';
import { useScreenCapture } from '@/hooks';
import { RecordingStatus } from '@/types';

export const HomeScreen: React.FC = () => {
  const { theme } = useTheme();
  const { state, startRecording, stopRecording, isRecording } = useScreenCapture();

  const handleToggleRecording = useCallback(async () => {
    if (isRecording) {
      Alert.alert('Stop Recording', 'Are you sure you want to stop the recording?', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Stop',
          style: 'destructive',
          onPress: stopRecording,
        },
      ]);
    } else {
      await startRecording();
    }
  }, [isRecording, startRecording, stopRecording]);

  const getButtonConfig = () => {
    switch (state.status) {
      case RecordingStatus.IDLE:
        return {
          title: 'Start Broadcast',
          icon: 'radio-outline',
          variant: 'primary' as const,
          loading: false,
        };
      case RecordingStatus.PREPARING:
        return {
          title: 'Preparing...',
          icon: 'hourglass-outline',
          variant: 'primary' as const,
          loading: true,
        };
      case RecordingStatus.RECORDING:
        return {
          title: 'Stop Broadcast',
          icon: 'stop-circle-outline',
          variant: 'danger' as const,
          loading: false,
        };
      case RecordingStatus.STOPPING:
        return {
          title: 'Stopping...',
          icon: 'hourglass-outline',
          variant: 'danger' as const,
          loading: true,
        };
      case RecordingStatus.ERROR:
        return {
          title: 'Try Again',
          icon: 'refresh-outline',
          variant: 'primary' as const,
          loading: false,
        };
      default:
        return {
          title: 'Start Broadcast',
          icon: 'radio-outline',
          variant: 'primary' as const,
          loading: false,
        };
    }
  };

  const buttonConfig = getButtonConfig();

  return (
    <Container safeAreaEdges={['bottom']}>
      <View style={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <Text variant="h2" weight="bold" align="center">
            MP Live Screen
          </Text>
          <Text
            variant="bodySmall"
            color={theme.colors.textSecondary}
            align="center"
            style={styles.subtitle}
          >
            Share your screen with the world
          </Text>
        </View>

        {/* Timer Section */}
        <View style={styles.timerSection}>
          <Timer isRunning={isRecording} startTime={state.startTime} />
          <StatusIndicator status={state.status} style={styles.statusIndicator} />
        </View>

        {/* Error Message */}
        {state.error && (
          <View
            style={[
              styles.errorContainer,
              {
                backgroundColor: `${theme.colors.error}15`,
                borderRadius: theme.borderRadius.md,
              },
            ]}
          >
            <Text variant="bodySmall" color={theme.colors.error} align="center">
              {state.error}
            </Text>
          </View>
        )}

        {/* Spacer */}
        <View style={styles.spacer} />

        {/* Instructions */}
        {!isRecording && state.status === RecordingStatus.IDLE && (
          <View style={styles.instructions}>
            {Platform.OS === 'ios' ? (
              <>
                <Text variant="bodySmall" color={theme.colors.textSecondary} align="center">
                  Tap the broadcast button below to share your screen.
                </Text>
                <Text
                  variant="caption"
                  color={theme.colors.textTertiary}
                  align="center"
                  style={styles.instructionNote}
                >
                  Select "MP Live Screen Broadcast" from the picker to start.
                </Text>
              </>
            ) : (
              <>
                <Text variant="bodySmall" color={theme.colors.textSecondary} align="center">
                  Tap the button below to start broadcasting your screen.
                </Text>
                <Text
                  variant="caption"
                  color={theme.colors.textTertiary}
                  align="center"
                  style={styles.instructionNote}
                >
                  Your screen will be recorded and sent to the server in real-time.
                </Text>
              </>
            )}
          </View>
        )}
      </View>

      {/* Bottom Button Section */}
      <View style={styles.buttonContainer}>
        {Platform.OS === 'ios' && state.status === RecordingStatus.IDLE ? (
          // iOS: Show the broadcast picker or fallback button
          <View style={styles.iosButtonContainer}>
            <BroadcastPicker
              style={styles.broadcastPickerFull}
              onPress={handleToggleRecording}
            />
          </View>
        ) : (
          // Android or iOS (when recording)
          <Button
            title={buttonConfig.title}
            icon={buttonConfig.icon}
            variant={buttonConfig.variant}
            size="xl"
            onPress={handleToggleRecording}
            loading={buttonConfig.loading}
            disabled={buttonConfig.loading}
            fullWidth
          />
        )}
      </View>
    </Container>
  );
};

const styles = StyleSheet.create({
  content: {
    flex: 1,
    paddingTop: 20,
  },
  header: {
    marginBottom: 40,
  },
  subtitle: {
    marginTop: 8,
  },
  timerSection: {
    alignItems: 'center',
    marginBottom: 24,
  },
  statusIndicator: {
    marginTop: 16,
  },
  errorContainer: {
    padding: 12,
    marginHorizontal: 16,
    marginBottom: 16,
  },
  spacer: {
    flex: 1,
  },
  instructions: {
    paddingHorizontal: 24,
    marginBottom: 24,
  },
  instructionNote: {
    marginTop: 8,
  },
  buttonContainer: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  iosButtonContainer: {
    alignItems: 'center',
    width: '100%',
  },
  broadcastPickerFull: {
    width: '100%',
  },
});

export default HomeScreen;
