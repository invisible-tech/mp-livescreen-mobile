import { Platform, Alert, Linking } from 'react-native';

/**
 * Show alert to open app settings
 */
export const showPermissionAlert = (
  title: string,
  message: string,
  onCancel?: () => void,
): void => {
  Alert.alert(title, message, [
    {
      text: 'Cancel',
      style: 'cancel',
      onPress: onCancel,
    },
    {
      text: 'Open Settings',
      onPress: () => {
        if (Platform.OS === 'ios') {
          Linking.openURL('app-settings:');
        } else {
          Linking.openSettings();
        }
      },
    },
  ]);
};

/**
 * Request screen recording permission (platform specific handling in native modules)
 */
export const requestScreenRecordingPermission = async (): Promise<boolean> => {
  // Actual permission request is handled by native modules
  // This is a placeholder for any pre-checks
  return true;
};

/**
 * Check if screen recording is available on the device
 */
export const isScreenRecordingAvailable = (): boolean => {
  // iOS 11+ and Android 5+ support screen recording
  // Our app requires iOS 17+ and Android 13+ so this should always be true
  return true;
};

