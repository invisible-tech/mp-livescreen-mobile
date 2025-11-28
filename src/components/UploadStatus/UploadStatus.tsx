/**
 * Upload Status Component
 * Shows real-time upload progress from the Broadcast Extension
 */

import React, { useEffect, useState, useRef } from 'react';
import { View, StyleSheet, Animated, NativeModules, Platform } from 'react-native';
import { Text } from '@/components/Text';
import { useTheme } from '@/context/ThemeContext';

const { ScreenCaptureModule } = NativeModules;

interface UploadStatusData {
  chunkIndex: number;
  status: 'uploading' | 'success' | 'failed';
  error?: string;
  timestamp: number;
  chunksUploaded: number;
  recordingId: string;
}

interface UploadStatusProps {
  isRecording: boolean;
}

export const UploadStatus: React.FC<UploadStatusProps> = ({ isRecording }) => {
  const { theme } = useTheme();
  const [status, setStatus] = useState<UploadStatusData | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  // Poll for upload status while recording
  useEffect(() => {
    if (!isRecording || Platform.OS !== 'ios') {
      setStatus(null);
      return;
    }

    const pollStatus = async () => {
      try {
        const uploadStatus = await ScreenCaptureModule?.getUploadStatus?.();
        if (uploadStatus) {
          setStatus(uploadStatus as UploadStatusData);
          if (uploadStatus.status === 'failed' && uploadStatus.error) {
            setLastError(uploadStatus.error);
          }
        }
      } catch (error) {
        console.log('[UploadStatus] Error polling status:', error);
      }
    };

    // Poll every 500ms
    const interval = setInterval(pollStatus, 500);
    pollStatus(); // Initial poll

    return () => clearInterval(interval);
  }, [isRecording]);

  // Pulse animation for uploading state
  useEffect(() => {
    if (status?.status === 'uploading') {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 0.6,
            duration: 500,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 500,
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      pulseAnim.setValue(1);
    }
  }, [status?.status, pulseAnim]);

  // Fade in animation
  useEffect(() => {
    if (status) {
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();
    }
  }, [status, fadeAnim]);

  if (!isRecording || !status) {
    return null;
  }

  const getStatusColor = () => {
    switch (status.status) {
      case 'uploading':
        return theme.colors.warning;
      case 'success':
        return theme.colors.success;
      case 'failed':
        return theme.colors.error;
      default:
        return theme.colors.textSecondary;
    }
  };

  const getStatusIcon = () => {
    switch (status.status) {
      case 'uploading':
        return '⬆️';
      case 'success':
        return '✅';
      case 'failed':
        return '❌';
      default:
        return '⏳';
    }
  };

  const getStatusText = () => {
    switch (status.status) {
      case 'uploading':
        return `Uploading chunk ${status.chunkIndex + 1}...`;
      case 'success':
        return `${status.chunksUploaded} chunks uploaded`;
      case 'failed':
        return `Upload failed`;
      default:
        return 'Preparing...';
    }
  };

  return (
    <Animated.View
      style={[
        styles.container,
        {
          backgroundColor: `${getStatusColor()}15`,
          borderColor: `${getStatusColor()}40`,
          opacity: fadeAnim,
        },
      ]}
    >
      <Animated.View style={[styles.iconContainer, { opacity: pulseAnim }]}>
        <Text style={styles.icon}>{getStatusIcon()}</Text>
      </Animated.View>

      <View style={styles.textContainer}>
        <Text
          variant="bodySmall"
          weight="medium"
          style={{ color: getStatusColor() }}
        >
          {getStatusText()}
        </Text>
        
        {status.status === 'failed' && lastError && (
          <Text
            variant="caption"
            style={{ color: theme.colors.error, marginTop: 2 }}
            numberOfLines={1}
          >
            {lastError}
          </Text>
        )}
      </View>

      {/* Progress indicator */}
      <View style={styles.progressContainer}>
        <View
          style={[
            styles.progressDot,
            { backgroundColor: getStatusColor() },
            status.status === 'uploading' && styles.progressDotActive,
          ]}
        />
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 24,
    marginTop: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  iconContainer: {
    marginRight: 12,
  },
  icon: {
    fontSize: 20,
  },
  textContainer: {
    flex: 1,
  },
  progressContainer: {
    marginLeft: 12,
  },
  progressDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  progressDotActive: {
    shadowColor: '#FBBF24',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 4,
    elevation: 4,
  },
});

export default UploadStatus;

