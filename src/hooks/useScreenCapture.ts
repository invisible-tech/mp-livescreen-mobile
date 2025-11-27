import { useState, useCallback, useEffect, useRef } from 'react';
import { NativeEventEmitter, Platform } from 'react-native';
import { RecordingStatus, RecordingState } from '@/types';
import ScreenCapture from '@/native/ScreenCapture';

// Note: For now, we're running in LOCAL MODE (no backend).
// The broadcast extension captures the screen like Zoom does.
// Backend integration can be enabled later.

const LOCAL_MODE = true; // Set to false when backend is ready

interface UseScreenCaptureReturn {
  state: RecordingState;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<void>;
  isRecording: boolean;
}

const initialState: RecordingState = {
  status: RecordingStatus.IDLE,
  recordingId: null,
  startTime: null,
  duration: 0,
  error: null,
};

export const useScreenCapture = (): UseScreenCaptureReturn => {
  const [state, setState] = useState<RecordingState>(initialState);
  const eventEmitterRef = useRef<NativeEventEmitter | null>(null);

  // Set up event listeners for native module events
  useEffect(() => {
    if (Platform.OS === 'ios') {
      // iOS event emitter setup would go here when native module is ready
      // eventEmitterRef.current = new NativeEventEmitter(ScreenCapture);
    }

    return () => {
      // Cleanup event listeners
      eventEmitterRef.current?.removeAllListeners('onChunkReady');
      eventEmitterRef.current?.removeAllListeners('onRecordingStopped');
      eventEmitterRef.current?.removeAllListeners('onError');
    };
  }, []);

  const startRecording = useCallback(async () => {
    try {
      setState(prev => ({ ...prev, status: RecordingStatus.PREPARING, error: null }));

      if (LOCAL_MODE) {
        // LOCAL MODE: Just start native capture without backend
        console.log('[ScreenCapture] Starting in LOCAL MODE (no backend)');
        
        // Generate a local recording ID
        const localRecordingId = `local-${Date.now()}`;
        
        // Start native screen capture
        await ScreenCapture.startBroadcast();

        setState({
          status: RecordingStatus.RECORDING,
          recordingId: localRecordingId,
          startTime: Date.now(),
          duration: 0,
          error: null,
        });
        
        console.log('[ScreenCapture] Recording started:', localRecordingId);
      } else {
        // BACKEND MODE: Full integration with API
        const { apiClient } = await import('@/api');
        const { RECORDING_CONFIG } = await import('@/config');
        const { getDeviceId, getPlatform } = await import('@/utils');

        const response = await apiClient.startRecording({
          deviceId: getDeviceId(),
          platform: getPlatform(),
          quality: RECORDING_CONFIG.VIDEO_QUALITY,
          frameRate: RECORDING_CONFIG.FRAME_RATE,
        });

        if (!response.success || !response.data) {
          throw new Error(response.error || 'Failed to start recording session');
        }

        const { recordingId } = response.data;
        await ScreenCapture.startBroadcast();

        setState({
          status: RecordingStatus.RECORDING,
          recordingId,
          startTime: Date.now(),
          duration: 0,
          error: null,
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to start recording';
      console.log('[ScreenCapture] Error:', errorMessage);
      setState(prev => ({
        ...prev,
        status: RecordingStatus.ERROR,
        error: errorMessage,
      }));
    }
  }, []);

  const stopRecording = useCallback(async () => {
    try {
      setState(prev => ({ ...prev, status: RecordingStatus.STOPPING }));

      // Stop native screen capture
      await ScreenCapture.stopBroadcast();
      
      console.log('[ScreenCapture] Recording stopped');

      if (!LOCAL_MODE && state.recordingId) {
        // BACKEND MODE: End session with API
        const { apiClient } = await import('@/api');
        const duration = state.startTime ? Date.now() - state.startTime : 0;
        await apiClient.endRecording({
          recordingId: state.recordingId,
          totalChunks: 0,
          totalDuration: duration,
        });
      }

      setState(initialState);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to stop recording';
      console.log('[ScreenCapture] Stop error:', errorMessage);
      setState(prev => ({
        ...prev,
        status: RecordingStatus.ERROR,
        error: errorMessage,
      }));
    }
  }, [state.recordingId, state.startTime]);

  return {
    state,
    startRecording,
    stopRecording,
    isRecording: state.status === RecordingStatus.RECORDING,
  };
};

export default useScreenCapture;

