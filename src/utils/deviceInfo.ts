import { Platform } from 'react-native';

/**
 * Generate a simple device ID (in production, use a proper device ID library)
 */
export const getDeviceId = (): string => {
  // In production, use something like react-native-device-info
  // For now, generate a random ID
  return `${Platform.OS}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * Get current platform
 */
export const getPlatform = (): 'ios' | 'android' => {
  return Platform.OS as 'ios' | 'android';
};

/**
 * Get platform version
 */
export const getPlatformVersion = (): string => {
  return Platform.Version.toString();
};

/**
 * Check if device is iOS
 */
export const isIOS = Platform.OS === 'ios';

/**
 * Check if device is Android
 */
export const isAndroid = Platform.OS === 'android';

