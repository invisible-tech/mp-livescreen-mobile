import React, { useCallback, useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  Alert,
  Platform,
  Animated,
  Dimensions,
} from 'react-native';
import {
  Container,
  Button,
  Text,
  BroadcastPicker,
  ScreenTitle,
} from '@/components';
import { useTheme } from '@/context/ThemeContext';
import { useScreenCapture } from '@/hooks';
import { RecordingStatus } from '@/types';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export const HomeScreen: React.FC = () => {
  const { theme } = useTheme();
  const { state, startRecording, stopRecording, isRecording } = useScreenCapture();

  // Pulse animation for recording state
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const glowAnim = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    if (isRecording) {
      // Pulse animation when recording
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.05,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 1000,
            useNativeDriver: true,
          }),
        ])
      ).start();

      // Glow animation
      Animated.loop(
        Animated.sequence([
          Animated.timing(glowAnim, {
            toValue: 0.6,
            duration: 1500,
            useNativeDriver: true,
          }),
          Animated.timing(glowAnim, {
            toValue: 0.3,
            duration: 1500,
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      pulseAnim.setValue(1);
      glowAnim.setValue(0.3);
    }
  }, [isRecording, pulseAnim, glowAnim]);

  const handleToggleRecording = useCallback(async () => {
    if (isRecording) {
      Alert.alert('Stop Broadcast', 'Are you sure you want to stop sharing your screen?', [
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
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {/* Background gradient when recording */}
      {isRecording && (
        <Animated.View style={[styles.recordingGlow, { opacity: glowAnim }]}>
          <View style={[styles.glowCircle, styles.glowCircle1]} />
          <View style={[styles.glowCircle, styles.glowCircle2]} />
        </Animated.View>
      )}

      <Container safeAreaEdges={['bottom']} style={styles.innerContainer}>
        <ScreenTitle title="Live Capture" />

        {/* Live Badge when recording */}
        {isRecording && (
          <Animated.View
            style={[
              styles.liveBadgeContainer,
              { transform: [{ scale: pulseAnim }] },
            ]}
          >
            <View style={styles.liveBadge}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>LIVE</Text>
            </View>
          </Animated.View>
        )}

        {/* Error Message */}
        {state.error && (
          <View
            style={[
              styles.errorContainer,
              {
                backgroundColor: `${theme.colors.error}15`,
                borderColor: `${theme.colors.error}30`,
              },
            ]}
          >
            <Text variant="bodySmall" color={theme.colors.error} align="center">
              {state.error}
            </Text>
          </View>
        )}
      </Container>

      {/* Bottom Button Section - Fixed at bottom */}
      <View style={[styles.buttonContainer, { backgroundColor: theme.colors.background }]}>
          {Platform.OS === 'ios' ? (
            <BroadcastPicker
              style={styles.broadcastPicker}
              onPress={handleToggleRecording}
              isRecording={isRecording}
              startTime={state.startTime}
            />
          ) : (
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
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  innerContainer: {
    flex: 1,
  },
  recordingGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  glowCircle: {
    position: 'absolute',
    borderRadius: 999,
    backgroundColor: '#FF3B30',
  },
  glowCircle1: {
    width: SCREEN_WIDTH * 1.5,
    height: SCREEN_WIDTH * 1.5,
    top: -SCREEN_WIDTH * 0.5,
    left: -SCREEN_WIDTH * 0.25,
    opacity: 0.1,
  },
  glowCircle2: {
    width: SCREEN_WIDTH,
    height: SCREEN_WIDTH,
    bottom: -SCREEN_WIDTH * 0.3,
    right: -SCREEN_WIDTH * 0.3,
    opacity: 0.08,
  },
  liveBadgeContainer: {
    alignItems: 'center',
    marginTop: 16,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FF3B30',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FFFFFF',
    marginRight: 6,
  },
  liveText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
  },
  errorContainer: {
    marginHorizontal: 20,
    marginTop: 16,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  buttonContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingBottom: 12,
    paddingTop: 16,
  },
  broadcastPicker: {
    width: '100%',
  },
});

export default HomeScreen;
