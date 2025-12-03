import { NativeModules, Platform } from 'react-native';

interface PermissionsResult {
  microphone: boolean;
  photoLibrary: boolean;
}

interface PermissionsStatus {
  microphone: boolean;
  microphoneStatus: number;
  photoLibrary: boolean;
  photoLibraryStatus: number;
}

interface PendingVideo {
  path: string;
  filename: string;
  size: number;
}

interface UploadStatus {
  chunkIndex: number;
  status: string;
  error: string;
  timestamp: number;
  chunksUploaded: number;
  recordingId: string;
  isFinalUploaded: boolean;
}

interface TaskParams {
  tenantId?: string;
  campaignId?: string;
  campaignName?: string;
  stepId?: string;
  taskId?: string;
  taskType?: 'audio-video' | 'audio';
  apiBaseUrl?: string;
  aiAppType?: 'gemini' | 'chatgpt' | 'search-live';
  xApiKey?: string;
}

interface ScreenCaptureNativeModule {
  // Permissions
  requestMicrophonePermission: () => Promise<boolean>;
  requestPhotoLibraryPermission: () => Promise<boolean>;
  requestAllPermissions: () => Promise<PermissionsResult>;
  checkPermissions: () => Promise<PermissionsStatus>;
  
  // Video Saving
  checkPendingVideo: () => Promise<PendingVideo | null>;
  savePendingVideoToPhotos: () => Promise<boolean>;
  
  // Broadcast Control
  startBroadcast: () => Promise<void>;
  stopBroadcast: () => Promise<void>;
  isRecording: () => Promise<boolean>;
  isBroadcastActive: () => Promise<boolean>;
  
  // Task Parameters
  setTaskParams: (params: TaskParams) => Promise<boolean>;
  clearTaskParams: () => Promise<boolean>;
  setChunkDuration: (seconds: number) => Promise<boolean>;
  getUploadStatus: () => Promise<UploadStatus | null>;
  
  // Debug
  getExtensionLogs: () => Promise<string>;
  listAppGroupFiles: () => Promise<string>;
}

// Mock implementation for when native module is not available
const MockScreenCapture: ScreenCaptureNativeModule = {
  requestMicrophonePermission: async () => {
    console.warn('[ScreenCapture] Mock: requestMicrophonePermission');
    return true;
  },
  requestPhotoLibraryPermission: async () => {
    console.warn('[ScreenCapture] Mock: requestPhotoLibraryPermission');
    return true;
  },
  requestAllPermissions: async () => {
    console.warn('[ScreenCapture] Mock: requestAllPermissions');
    return { microphone: true, photoLibrary: true };
  },
  checkPermissions: async () => {
    console.warn('[ScreenCapture] Mock: checkPermissions');
    return { microphone: true, microphoneStatus: 3, photoLibrary: true, photoLibraryStatus: 3 };
  },
  checkPendingVideo: async () => {
    console.warn('[ScreenCapture] Mock: checkPendingVideo');
    return null;
  },
  savePendingVideoToPhotos: async () => {
    console.warn('[ScreenCapture] Mock: savePendingVideoToPhotos');
    return false;
  },
  startBroadcast: async () => {
    console.warn('[ScreenCapture] Mock: startBroadcast');
  },
  stopBroadcast: async () => {
    console.warn('[ScreenCapture] Mock: stopBroadcast');
  },
  isRecording: async () => {
    console.warn('[ScreenCapture] Mock: isRecording');
    return false;
  },
  isBroadcastActive: async () => {
    console.warn('[ScreenCapture] Mock: isBroadcastActive');
    return false;
  },
  setTaskParams: async () => {
    console.warn('[ScreenCapture] Mock: setTaskParams');
    return true;
  },
  clearTaskParams: async () => {
    console.warn('[ScreenCapture] Mock: clearTaskParams');
    return true;
  },
  setChunkDuration: async () => {
    console.warn('[ScreenCapture] Mock: setChunkDuration');
    return true;
  },
  getUploadStatus: async () => {
    console.warn('[ScreenCapture] Mock: getUploadStatus');
    return null;
  },
  getExtensionLogs: async () => {
    console.warn('[ScreenCapture] Mock: getExtensionLogs');
    return 'Mock: No logs available';
  },
  listAppGroupFiles: async () => {
    console.warn('[ScreenCapture] Mock: listAppGroupFiles');
    return 'Mock: No files';
  },
};

const getNativeModule = (): ScreenCaptureNativeModule => {
  if (Platform.OS === 'ios') {
    const module = NativeModules.ScreenCaptureModule;
    if (!module) {
      if (__DEV__) {
        console.warn(
          '[ScreenCapture] Native module not found. Using mock implementation. ' +
            'Make sure to build the iOS app with Xcode.',
        );
      }
      return MockScreenCapture;
    }
    return module as ScreenCaptureNativeModule;
  }

  if (Platform.OS === 'android') {
    const module = NativeModules.ScreenCaptureModule;
    if (!module) {
      if (__DEV__) {
        console.warn(
          '[ScreenCapture] Native module not found. Using mock implementation. ' +
            'Make sure to build the Android native module.',
        );
      }
      return MockScreenCapture;
    }
    return module as ScreenCaptureNativeModule;
  }

  return MockScreenCapture;
};

const ScreenCapture = getNativeModule();

export default ScreenCapture;
