import { NativeModules, Platform } from 'react-native';

interface ScreenCaptureNativeModule {
  startBroadcast: () => Promise<void>;
  stopBroadcast: () => Promise<void>;
  isRecording: () => Promise<boolean>;
}

// Mock implementation for when native module is not available
const MockScreenCapture: ScreenCaptureNativeModule = {
  startBroadcast: async () => {
    if (__DEV__) {
      console.warn('[ScreenCapture] Mock: startBroadcast called');
    }
    return Promise.resolve();
  },
  stopBroadcast: async () => {
    if (__DEV__) {
      console.warn('[ScreenCapture] Mock: stopBroadcast called');
    }
    return Promise.resolve();
  },
  isRecording: async () => {
    if (__DEV__) {
      console.warn('[ScreenCapture] Mock: isRecording called');
    }
    return Promise.resolve(false);
  },
};

const getNativeModule = (): ScreenCaptureNativeModule => {
  if (Platform.OS === 'ios') {
    const module = NativeModules.ScreenCapture;
    if (!module) {
      if (__DEV__) {
        console.warn(
          '[ScreenCapture] Native module not found. Using mock implementation. ' +
            'Make sure to build the iOS Broadcast Extension.',
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

